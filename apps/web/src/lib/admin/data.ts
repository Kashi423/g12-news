import { AUTO_PUBLISH_QUALITY_THRESHOLD, CATEGORY_IDS, parseSwitch, REVIEW_STUCK_AFTER_MS, SETTING_REQUIRE_REVIEW, type CategoryId } from "@g12/config";
import type { HealthSnapshot } from "./alerts";
import { isOverdue } from "./alerts";
import { pakistanDay } from "./time";

/**
 * Database reads for /admin (server-only). The database client is loaded lazily, like the public pages
 * do, so `next build` works without a database. Unlike the public pages nothing here fails soft: if the
 * database is down the owner should be told, not shown an empty dashboard.
 */
export async function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set, so the dashboard has no database to read.");
  return (await import("@g12/db")).prisma;
}

export async function getRequireReview(): Promise<boolean> {
  const db = await getDb();
  const row = await db.setting.findUnique({ where: { key: SETTING_REQUIRE_REVIEW }, select: { value: true } });
  return parseSwitch(row?.value);
}

/** Everything the warning banners are decided from (see alerts.ts). */
export async function getHealthSnapshot(now: Date = new Date()): Promise<HealthSnapshot> {
  const db = await getDb();
  const stuckBefore = new Date(now.getTime() - REVIEW_STUCK_AFTER_MS);
  const [requireReview, sources, lastLog, pendingCount, stuckCount, oldest] = await Promise.all([
    getRequireReview(),
    db.source.findMany({ select: { id: true, name: true, isActive: true, createdAt: true, lastFetchedAt: true, lastSuccessAt: true, lastError: true }, orderBy: { name: "asc" } }),
    db.ingestLog.findFirst({ orderBy: { runAt: "desc" }, select: { runAt: true } }),
    db.article.count({ where: { status: "PENDING_REVIEW" } }),
    db.article.count({ where: { status: "PENDING_REVIEW", ingestedAt: { lt: stuckBefore } } }),
    db.article.findFirst({ where: { status: "PENDING_REVIEW" }, orderBy: { ingestedAt: "asc" }, select: { ingestedAt: true } }),
  ]);
  return { now, requireReview, sources, lastRunAt: lastLog?.runAt ?? null, pendingCount, stuckCount, oldestPendingAt: oldest?.ingestedAt ?? null };
}

export interface Stats {
  liveTotal: number;
  publishedToday: number;
  /** Categories with at least one story today, in the site's category order. */
  publishedTodayByCategory: { category: CategoryId; count: number }[];
  mostViewedToday: { title: string; slug: string; views: number } | null;
  newestLiveAt: Date | null;
}

export async function getStats(now: Date = new Date()): Promise<Stats> {
  const db = await getDb();
  const day = pakistanDay(now);
  const [byCategory, liveTotal, top, newest] = await Promise.all([
    db.article.groupBy({ by: ["category"], where: { status: "PUBLISHED", publishedAt: { gte: day.start } }, _count: { _all: true } }),
    db.article.count({ where: { status: "PUBLISHED" } }),
    db.articleDailyView.findFirst({
      // A @db.Date column: midnight UTC of the Pakistan date is what Prisma writes and reads.
      where: { day: new Date(`${day.ymd}T00:00:00Z`), article: { status: "PUBLISHED" } },
      orderBy: [{ views: "desc" }, { articleId: "asc" }],
      select: { views: true, article: { select: { title: true, slug: true } } },
    }),
    db.article.findFirst({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, select: { publishedAt: true } }),
  ]);
  const counts = new Map(byCategory.map((row) => [row.category as CategoryId, row._count._all]));
  const publishedTodayByCategory = CATEGORY_IDS.filter((id) => counts.has(id)).map((category) => ({ category, count: counts.get(category)! }));
  return {
    liveTotal,
    publishedToday: publishedTodayByCategory.reduce((n, row) => n + row.count, 0),
    publishedTodayByCategory,
    mostViewedToday: top ? { title: top.article.title, slug: top.article.slug, views: top.views } : null,
    newestLiveAt: newest?.publishedAt ?? null,
  };
}

// ---- Pending review ------------------------------------------------------------------------------------

/** The claim/quality breakdown shape apps/worker/src/ingest writes into Article.verification. */
export interface VerificationSummary {
  sourceCount: number;
  agreement: "confirmed" | "single-source" | "conflicting";
  conflicts: string[];
  claims: { text: string; status: string; corroboratingSources: number }[];
}

export interface PendingItem {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  category: CategoryId;
  urgencyScore: number;
  isBreaking: boolean;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  ingestedAt: string;
  /** How long it has been in the queue, and whether that is over the 4-hour limit. */
  waitingMs: number;
  overdue: boolean;
  /** Internal editorial signal (see apps/worker/src/ingest/quality.ts): never shown to readers. */
  qualityScore: number | null;
  developing: boolean;
  verification: VerificationSummary | null;
}

/** At most this many queued stories are shown at once (newest first); approve some and the rest appear. */
export const PENDING_PAGE_SIZE = 200;

export async function getPendingItems(now: Date = new Date()): Promise<PendingItem[]> {
  const db = await getDb();
  const rows = await db.article.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: [{ ingestedAt: "desc" }, { id: "asc" }],
    take: PENDING_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      excerpt: true,
      body: true,
      category: true,
      urgencyScore: true,
      isBreaking: true,
      sourceName: true,
      sourceUrl: true,
      publishedAt: true,
      ingestedAt: true,
      qualityScore: true,
      developing: true,
      verification: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    category: row.category as CategoryId,
    publishedAt: row.publishedAt.toISOString(),
    ingestedAt: row.ingestedAt.toISOString(),
    waitingMs: now.getTime() - row.ingestedAt.getTime(),
    overdue: isOverdue(row.ingestedAt, now),
    verification: (row.verification as VerificationSummary | null) ?? null,
  }));
}

// ---- Pipeline stats (requirement #19) -------------------------------------------------------------------

/** Same Setting keys apps/worker/src/ingest/prisma-store.ts writes AI usage under. */
const AI_USAGE_KEYS = { calls: "aiUsage:calls", inputTokens: "aiUsage:inputTokens", outputTokens: "aiUsage:outputTokens" } as const;

export interface PipelineStats {
  rssItemsFetched: number;
  duplicatesDetected: number;
  storyClusters: number;
  articlesGenerated: number;
  awaitingReview: number;
  published: number;
  rejected: number;
  /** Approximated as a quality score below the auto-publish floor (see @g12/config's AUTO_PUBLISH_QUALITY_THRESHOLD): the article's own claim/verification breakdown is JSON, not cheaply queryable in bulk. */
  validationFailures: number;
  socialPosts: { posted: number; pending: number; failed: number };
  failedJobs: number;
  aiUsage: { calls: number; inputTokens: number; outputTokens: number };
}

export async function getPipelineStats(): Promise<PipelineStats> {
  const db = await getDb();
  const [byStatus, storyClusters, duplicatesDetected, socialByStatus, failedJobs, fetchedSum, validationFailures, usageRows] = await Promise.all([
    db.article.groupBy({ by: ["status"], _count: { _all: true } }),
    db.storyCluster.count(),
    db.article.count({ where: { status: "REJECTED", excerpt: { startsWith: "Rejected: duplicate" } } }),
    db.socialPost.groupBy({ by: ["status"], _count: { _all: true } }),
    db.ingestLog.count({ where: { error: { not: null } } }),
    db.ingestLog.aggregate({ _sum: { itemsFound: true } }),
    db.article.count({ where: { qualityScore: { lt: AUTO_PUBLISH_QUALITY_THRESHOLD }, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } } }),
    db.setting.findMany({ where: { key: { in: Object.values(AI_USAGE_KEYS) } }, select: { key: true, value: true } }),
  ]);
  const statusCount = (status: string) => byStatus.find((r) => r.status === status)?._count._all ?? 0;
  const socialCount = (status: string) => socialByStatus.find((r) => r.status === status)?._count._all ?? 0;
  const usage = new Map(usageRows.map((r) => [r.key, Number.parseInt(r.value, 10) || 0]));
  return {
    rssItemsFetched: fetchedSum._sum.itemsFound ?? 0,
    duplicatesDetected,
    storyClusters,
    // REJECTED rows include AI rejections and duplicate stubs, which have no body; only a real draft counts as "generated".
    articlesGenerated: statusCount("PUBLISHED") + statusCount("PENDING_REVIEW") + statusCount("DRAFT"),
    awaitingReview: statusCount("PENDING_REVIEW"),
    published: statusCount("PUBLISHED"),
    rejected: statusCount("REJECTED"),
    validationFailures,
    socialPosts: { posted: socialCount("POSTED"), pending: socialCount("PENDING"), failed: socialCount("FAILED") },
    failedJobs,
    aiUsage: { calls: usage.get(AI_USAGE_KEYS.calls) ?? 0, inputTokens: usage.get(AI_USAGE_KEYS.inputTokens) ?? 0, outputTokens: usage.get(AI_USAGE_KEYS.outputTokens) ?? 0 },
  };
}

// ---- Sources and the ingestion log ---------------------------------------------------------------------

export async function getSources() {
  const db = await getDb();
  return db.source.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, rssUrl: true, category: true, isActive: true, lastFetchedAt: true, lastSuccessAt: true, lastError: true, createdAt: true, reliability: true },
  });
}

export const LOG_ROWS = 100;

export async function getLogRows(errorsOnly: boolean) {
  const db = await getDb();
  return db.ingestLog.findMany({
    where: errorsOnly ? { error: { not: null } } : undefined,
    orderBy: [{ runAt: "desc" }, { id: "asc" }],
    take: LOG_ROWS,
    select: { id: true, runAt: true, itemsFound: true, itemsPublished: true, itemsSkipped: true, error: true, source: { select: { name: true } } },
  });
}

// ---- Article moderation --------------------------------------------------------------------------------

export type ArticleStatusFilter = "PUBLISHED" | "DRAFT" | "ALL";
export interface ArticleFilter {
  q: string;
  category: CategoryId | "";
  status: ArticleStatusFilter;
  breaking: boolean;
  page: number;
}
export const ARTICLES_PER_PAGE = 30;

export async function searchArticles(filter: ArticleFilter) {
  const db = await getDb();
  const q = filter.q.trim();
  const where = {
    // "Unpublished" is DRAFT. REJECTED rows (the AI's rejects and deleted stories) and the review queue are not listed here.
    status: filter.status === "ALL" ? { in: ["PUBLISHED" as const, "DRAFT" as const] } : filter.status,
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.breaking ? { isBreaking: true } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { sourceName: { contains: q, mode: "insensitive" as const } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.article.count({ where }),
    db.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      skip: (filter.page - 1) * ARTICLES_PER_PAGE,
      take: ARTICLES_PER_PAGE,
      select: { id: true, slug: true, title: true, category: true, status: true, isBreaking: true, urgencyScore: true, viewCount: true, sourceName: true, publishedAt: true, correctedAt: true },
    }),
  ]);
  return { total, rows };
}
