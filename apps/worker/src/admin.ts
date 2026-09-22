// What the admin dashboard (apps/web, /admin) calls into. Everything here runs the SAME pipeline code as the
// scheduled worker (`runIngestion`), in the web server's process, so a manual "Fetch now" behaves exactly like
// a scheduled pass restricted to one source: same screening, same AI, same review switch, same IngestLog row.
//
// Imported as "@g12/worker/admin" (see this package's `exports`). Nothing here starts a scheduler.
import type { CategoryId } from "@g12/config";
import { prisma, Prisma } from "@g12/db";
import { describeError, fetchFeed } from "./ingest/feed";
import { computeQualityScore } from "./ingest/quality";
import { runIngestion, type SourceReport } from "./ingest/pipeline";
import { AiUnavailableError } from "./ingest/types";
import { wordCount } from "./ingest/text";
import { finalUrgency } from "./ingest/urgency";
import { crossSourceVerify, hasFailingClaims, validateClaims, type SourceText } from "./ingest/verification";
import { analyzeArticle } from "./lib/ai";
import { aiConfigProblems } from "./lib/provider";
import { createRunDeps } from "./runtime";
import { loadSettings } from "./settings";

export interface SourceRunResult {
  /** False when nothing ran (already running, not configured, source inactive) or the feed could not be read. */
  ok: boolean;
  /** One plain sentence for the button's result line. */
  message: string;
  report: Pick<SourceReport, "found" | "published" | "queued" | "rejected" | "duplicates" | "alreadyIngested" | "tooOld" | "deferred" | "invalid" | "aiErrors"> | null;
  /** The pipeline's own progress lines, for the curious. */
  log: string[];
}

const failed = (message: string): SourceRunResult => ({ ok: false, message, report: null, log: [] });

// One manual run per source at a time: a double click must not start two AI passes over the same feed.
const running = new Set<string>();

/** One ingestion run for a single source: the manual "Fetch now". Ignores the per-feed minimum interval. */
export async function runSourceNow(sourceId: string): Promise<SourceRunResult> {
  if (running.has(sourceId)) return failed("A fetch for this source is already running.");
  const problems = [...(process.env.DATABASE_URL ? [] : ["DATABASE_URL"]), ...aiConfigProblems()];
  if (problems.length) return failed(`The website cannot run the AI pipeline: missing ${problems.join("; ")}. Put it in the root .env file and restart the website.`);

  running.add(sourceId);
  const log: string[] = [];
  try {
    const deps = await createRunDeps((line) => {
      if (log.length < 80) log.push(line);
    });
    const run = await runIngestion(deps, { force: true, sourceIds: [sourceId] });
    const r = run.sources[0];
    if (!r) return failed("That source is inactive or no longer exists. Turn it on under Sources first.");
    if (r.error) return { ok: false, message: `Could not read the feed: ${r.error}`, report: r, log };
    const parts = [`${r.found} item${r.found === 1 ? "" : "s"} in the feed`];
    if (r.published) parts.push(r.queued ? `${r.queued} queued for review` : `${r.published} published`);
    if (r.rejected) parts.push(`${r.rejected} rejected`);
    if (r.duplicates) parts.push(`${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"}`);
    if (r.alreadyIngested) parts.push(`${r.alreadyIngested} already saved`);
    if (r.tooOld) parts.push(`${r.tooOld} too old`);
    if (r.deferred) parts.push(`${r.deferred} left for the next run`);
    if (r.aiErrors) parts.push(`${r.aiErrors} failed AI checks`);
    const note = run.aiUnavailable ? ` The AI is unavailable: ${run.aiUnavailable}` : "";
    return { ok: !run.aiUnavailable && r.aiErrors === 0, message: `Done: ${parts.join(", ")}.${note}`, report: r, log };
  } catch (error) {
    return { ok: false, message: `The run failed: ${describeError(error)}`, report: null, log };
  } finally {
    running.delete(sourceId);
  }
}

export interface FeedCheck {
  ok: boolean;
  message: string;
}

/**
 * Does this address serve a usable feed, and how fresh is it? Used when a source is added or its address
 * changed. A feed that parses but is weeks old is reported as a problem: it would just sit there.
 */
export async function checkFeed(url: string): Promise<FeedCheck> {
  try {
    const items = await fetchFeed(url, loadSettings());
    if (items.length === 0) return { ok: false, message: "the feed loads but has no items" };
    const times = items.map((i) => i.publishedAt?.getTime()).filter((t): t is number => typeof t === "number");
    if (times.length === 0) return { ok: true, message: `${items.length} items (the feed gives no dates)` };
    const hours = Math.round((Date.now() - Math.max(...times)) / 3_600_000);
    if (hours > 24 * 7) return { ok: false, message: `${items.length} items, but the newest is ${Math.round(hours / 24)} days old: this feed is stale` };
    return { ok: true, message: `${items.length} items, newest ${hours < 1 ? "under an hour" : `${hours}h`} old` };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

export interface DraftActionResult {
  ok: boolean;
  message: string;
}

/**
 * Re-runs the AI over this story's own original source material and replaces the draft (headline,
 * summary, excerpt, tags, urgency) with the new attempt. The story stays PENDING_REVIEW either way:
 * this is a tool for a queued story that needs another try, not a way around review (requirement #9).
 */
export async function regenerateDraft(articleId: string): Promise<DraftActionResult> {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { status: true, category: true, publishedAt: true, sourceUrl: true, sourceName: true, title: true, clusterId: true },
  });
  if (!article) return { ok: false, message: "That story no longer exists." };
  if (article.status !== "PENDING_REVIEW") return { ok: false, message: "Only a story still waiting for review can be regenerated." };

  const lead = article.clusterId ? await prisma.clusterSource.findFirst({ where: { clusterId: article.clusterId, url: article.sourceUrl } }) : null;
  if (!lead) return { ok: false, message: "The original source text for this story was not kept (it predates this feature), so it cannot be regenerated." };

  const now = new Date();
  try {
    const outcome = await analyzeArticle({
      title: lead.title,
      description: lead.description,
      sourceName: article.sourceName,
      feedCategory: article.category as CategoryId,
      internationalFeed: article.category === "WORLD",
      publishedAt: article.publishedAt,
      now,
      similar: [],
    });
    if (outcome.kind !== "publish") {
      return { ok: false, message: outcome.kind === "reject" ? `The AI would now reject this item (${outcome.reason}). Left unchanged.` : "The AI now treats this as a duplicate. Left unchanged." };
    }
    const urgency = finalUrgency(outcome.urgencyScore, article.publishedAt, now, outcome.headline);
    await prisma.article.update({ where: { id: articleId }, data: { title: outcome.headline, excerpt: outcome.excerpt, body: outcome.summary, tags: outcome.tags, urgencyScore: urgency } });
    return { ok: true, message: "Generated a fresh draft from the original source. Still waiting for your review." };
  } catch (error) {
    return { ok: false, message: error instanceof AiUnavailableError ? `The AI is unavailable right now: ${error.message}` : `Regeneration failed: ${describeError(error)}` };
  }
}

/**
 * Recomputes claim validation and the internal quality score for this story's CURRENT text (useful
 * right after editing it by hand, or after another source has corroborated it) without calling the
 * AI again. Never changes what is shown to anyone; only the internal signals /admin reads.
 */
export async function revalidateDraft(articleId: string): Promise<DraftActionResult> {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { body: true, clusterId: true, publishedAt: true } });
  if (!article) return { ok: false, message: "That story no longer exists." };

  const rows = article.clusterId
    ? await prisma.clusterSource.findMany({ where: { clusterId: article.clusterId }, include: { source: { select: { reliability: true } } } })
    : [];
  const sourceTexts: SourceText[] = rows.map((r) => ({ sourceName: r.sourceName, title: r.title, description: r.description }));
  const verification = crossSourceVerify(sourceTexts);
  const claims = validateClaims(article.body, sourceTexts);
  const quality = computeQualityScore({
    sourceReliabilities: rows.map((r) => r.source.reliability),
    verification,
    claims,
    summaryWordCount: wordCount(article.body),
    publishedAt: article.publishedAt,
    now: new Date(),
    nearestSimilarity: 0,
  });
  await prisma.article.update({
    where: { id: articleId },
    data: { qualityScore: quality.score, verification: { ...verification, claims, breakdown: quality.breakdown } as unknown as Prisma.InputJsonValue, developing: verification.agreement === "single-source" },
  });
  const note = hasFailingClaims(claims) ? " Some claims do not check out against the collected sources." : "";
  return { ok: true, message: `Quality score is now ${quality.score}/100.${note}` };
}
