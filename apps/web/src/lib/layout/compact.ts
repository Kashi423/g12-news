/** Header compaction rule (pure, so it can be tested without a browser). */

/** Without a hero on the page, the header compacts after this much scrolling... */
export const COMPACT_AFTER_PX = 160;
/** ...and expands again only once the reader is back above this (the gap stops it flickering at the edge). */
export const EXPAND_BEFORE_PX = 100;
/** With a hero, it expands again once the hero is this far back below the header. */
export const HERO_EXPAND_MARGIN_PX = 48;

export interface CompactInput {
  scrollY: number;
  /** Bottom edge of the page's hero picture/story block in the viewport, or null when the page has none. */
  heroBottom: number | null;
  /** Where the sticky header (with the breaking bar above it) ends in the viewport when it is full size. */
  stackBottom: number;
}

/**
 * Whether the header should be compact. With a hero on the page (the homepage's top story, an article's
 * picture) it compacts once the hero has scrolled up underneath it; on other pages after a short scroll.
 * `current` is the present state: the two thresholds differ so the header does not flutter in between.
 */
export function nextCompact(current: boolean, { scrollY, heroBottom, stackBottom }: CompactInput): boolean {
  if (heroBottom !== null) return current ? heroBottom < stackBottom + HERO_EXPAND_MARGIN_PX : heroBottom < stackBottom;
  return current ? scrollY > EXPAND_BEFORE_PX : scrollY > COMPACT_AFTER_PX;
}
