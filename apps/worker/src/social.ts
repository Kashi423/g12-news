// Social-media publishing (requirement #14): posts an article out once it has cleared the full
// pipeline (published outright, or approved out of the review queue), tracks each platform's
// attempt as a SocialPost row, and retries a failed attempt on the next sweep.
//
// Imported as "@g12/worker/social" (see this package's `exports`), from apps/web's admin actions
// after an approval, and run as a sweep after every ingestion pass (see index.ts / ingest-once.ts).
//
// No real platform adapter is wired in: this project has no Facebook/X/WhatsApp API credentials, and
// inventing a call against an API with no key would be untested vaporware, not a working feature. The
// default publisher logs the post it would make and reports success, so the queue, retry and status
// bookkeeping this requirement asks for are real and exercised now. Swapping in a real adapter later
// (Facebook Graph API, X API, ...) means implementing `SocialPublisher.publish` — nothing else here,
// or in the pipeline, needs to change.
import { prisma } from "@g12/db";

export interface SocialArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
}

export interface SocialPlatformResult {
  ok: boolean;
  postId?: string;
  error?: string;
}

export interface SocialPublisher {
  platform: string;
  publish(article: SocialArticle): Promise<SocialPlatformResult>;
}

/** Logs the intended post and marks it POSTED. See the module comment for why this is the default. */
export function createLogPublisher(platform: string, log: (line: string) => void = (line) => console.log(line)): SocialPublisher {
  return {
    platform,
    async publish(article) {
      log(`[social:${platform}] would publish "${article.title}" (/article/${article.slug})`);
      return { ok: true, postId: `log-${platform}-${article.id}-${Date.now().toString(36)}` };
    },
  };
}

const MAX_ATTEMPTS = 3;

/** The platforms G12 News posts to. Every accepted story is offered to all of them. */
export function defaultPublishers(): SocialPublisher[] {
  return [createLogPublisher("facebook"), createLogPublisher("x"), createLogPublisher("whatsapp")];
}

/** One platform still worth trying: never attempted, or failed fewer than MAX_ATTEMPTS times. */
function needsAttempt(existing: { status: string; attempts: number } | undefined): boolean {
  return !existing || (existing.status !== "POSTED" && existing.attempts < MAX_ATTEMPTS);
}

/**
 * Publishes one article to every publisher that still needs an attempt. Never called for a story
 * that is not actually live (PUBLISHED): a queued or rejected story must not be announced.
 */
export async function publishToSocial(articleId: string, publishers: SocialPublisher[] = defaultPublishers()): Promise<void> {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true, title: true, slug: true, excerpt: true, status: true } });
  if (!article || article.status !== "PUBLISHED") return;

  const existingRows = await prisma.socialPost.findMany({ where: { articleId }, select: { id: true, platform: true, status: true, attempts: true } });
  const existingByPlatform = new Map(existingRows.map((r) => [r.platform, r]));

  for (const publisher of publishers) {
    const existing = existingByPlatform.get(publisher.platform);
    if (!needsAttempt(existing)) continue;
    const row = existing ?? (await prisma.socialPost.create({ data: { articleId, platform: publisher.platform, status: "PENDING" } }));
    try {
      const result = await publisher.publish(article);
      await prisma.socialPost.update({
        where: { id: row.id },
        data: { status: result.ok ? "POSTED" : "FAILED", postId: result.postId ?? null, error: result.error ?? null, attempts: { increment: 1 } },
      });
    } catch (error) {
      await prisma.socialPost
        .update({ where: { id: row.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), attempts: { increment: 1 } } })
        .catch(() => undefined);
    }
  }
}

/** How far back a sweep looks for live stories that might still need a social post. */
const SWEEP_WINDOW_HOURS = 48;
/** At most this many articles get a social-post attempt in one sweep, so a big backlog cannot run long. */
const SWEEP_LIMIT = 200;

/**
 * Finds recently published stories that have not yet been posted (or fully failed) on every
 * platform, and gives them a try. Covers both stories the pipeline just published outright and ones
 * an admin just approved out of the review queue, in one mechanism, and doubles as the retry sweep
 * for a platform that failed before.
 */
export async function publishPendingArticles(publishers: SocialPublisher[] = defaultPublishers()): Promise<{ checked: number; attempted: number }> {
  const candidates = await prisma.article.findMany({
    where: { status: "PUBLISHED", publishedAt: { gte: new Date(Date.now() - SWEEP_WINDOW_HOURS * 3_600_000) } },
    orderBy: { publishedAt: "desc" },
    take: SWEEP_LIMIT,
    select: { id: true },
  });
  let attempted = 0;
  for (const { id } of candidates) {
    const existingRows = await prisma.socialPost.findMany({ where: { articleId: id }, select: { platform: true, status: true, attempts: true } });
    const existingByPlatform = new Map(existingRows.map((r) => [r.platform, r]));
    const due = publishers.filter((p) => needsAttempt(existingByPlatform.get(p.platform)));
    if (due.length === 0) continue;
    attempted++;
    await publishToSocial(id, due);
  }
  return { checked: candidates.length, attempted };
}
