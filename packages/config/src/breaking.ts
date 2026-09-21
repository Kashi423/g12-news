/**
 * What "breaking" means on G12 News, in one place.
 *
 * An article is breaking when its `isBreaking` flag is set AND it was published within the last
 * BREAKING_MAX_AGE_HOURS. The AI pipeline sets the flag when urgencyScore >= BREAKING_URGENCY_THRESHOLD
 * (see site.ts); the admin override (a later step) will flip the same flag by hand, regardless of score.
 * The time limit is applied when reading, so a story stops being breaking on its own.
 */

export const BREAKING_MAX_AGE_HOURS = 6;
export const BREAKING_MAX_AGE_MS = BREAKING_MAX_AGE_HOURS * 3_600_000;

/** Headlines shown in the top-bar ticker. */
export const BREAKING_TICKER_COUNT = 5;
/** Cards shown in the homepage breaking block. */
export const BREAKING_BLOCK_COUNT = 4;

/** Postgres NOTIFY channel that announces articles becoming (or ceasing to be) breaking. */
export const BREAKING_NOTIFY_CHANNEL = "breaking_articles";

/** Oldest `publishedAt` that still counts as breaking at `now`. */
export function breakingCutoff(now: Date | number = Date.now()): Date {
  return new Date((typeof now === "number" ? now : now.getTime()) - BREAKING_MAX_AGE_MS);
}

export interface BreakingCandidate {
  isBreaking: boolean;
  publishedAt: Date | string | number;
}

/** True if the article is flagged breaking and still within the time window. */
export function isCurrentlyBreaking(article: BreakingCandidate, now: Date | number = Date.now()): boolean {
  if (!article.isBreaking) return false;
  const published = new Date(article.publishedAt).getTime();
  if (Number.isNaN(published)) return false;
  return published >= breakingCutoff(now).getTime();
}

/** Where an article lives on the site. The article page itself is built in a later step. */
export function articlePath(slug: string): string {
  return `/article/${slug}`;
}
