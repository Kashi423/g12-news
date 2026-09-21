import { CATEGORY_BY_ID, type CategoryId } from "@g12/config";
import type { HomeArticle } from "./types";

/** A story is "high-urgency" for the hero from this score up (breaking starts at 7). */
export const HERO_URGENCY_THRESHOLD = 6;
export const SECONDARY_COUNT = 3;
/** Most cards in a category section, and the fewest we aim for. */
export const SECTION_MAX = 6;
export const SECTION_MIN = 4;
/** How many recent stories the hero and its side stories are picked from. */
export const FEATURED_POOL_SIZE = 40;
export const TRENDING_COUNT = 5;

const newestFirst = (a: HomeArticle, b: HomeArticle) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.id < b.id ? -1 : 1);

export interface Featured {
  hero: HomeArticle | null;
  secondary: HomeArticle[];
}

/**
 * The hero is the most recent high-urgency story (falling back to simply the most recent story when
 * nothing is high-urgency). The three side stories are the next most recent high-urgency stories,
 * topped up with the most recent of the rest.
 */
export function pickFeatured(pool: readonly HomeArticle[]): Featured {
  const sorted = [...pool].sort(newestFirst);
  const high = sorted.filter((a) => a.urgencyScore >= HERO_URGENCY_THRESHOLD);
  const hero = high[0] ?? sorted[0] ?? null;
  if (!hero) return { hero: null, secondary: [] };
  const rest = sorted.filter((a) => a.id !== hero.id);
  const secondary = [...rest.filter((a) => a.urgencyScore >= HERO_URGENCY_THRESHOLD), ...rest.filter((a) => a.urgencyScore < HERO_URGENCY_THRESHOLD)].slice(0, SECONDARY_COUNT);
  return { hero, secondary };
}

/**
 * The stories for one category section: not already featured above, newest first, except that a
 * category's priority tag (cricket, for Sports) puts those stories first. Capped at SECTION_MAX.
 */
export function sectionArticles(category: CategoryId, articles: readonly HomeArticle[], featuredIds: ReadonlySet<string>): HomeArticle[] {
  const priorityTag = CATEGORY_BY_ID[category].priorityTag;
  const candidates = articles.filter((a) => !featuredIds.has(a.id)).sort(newestFirst);
  if (!priorityTag) return candidates.slice(0, SECTION_MAX);
  const prioritized = candidates.filter((a) => a.tags.includes(priorityTag));
  const others = candidates.filter((a) => !a.tags.includes(priorityTag));
  return [...prioritized, ...others].slice(0, SECTION_MAX);
}

/** How many cards to show for the stories available: up to 6, but a tidy 4 when there are 4 or 5. */
export function sectionDisplayCount(available: number): number {
  if (available >= SECTION_MAX) return SECTION_MAX;
  if (available >= SECTION_MIN) return SECTION_MIN;
  return available;
}
