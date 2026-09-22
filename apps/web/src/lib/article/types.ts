import type { CategoryId } from "@g12/config";

/** A story as the article page shows it: the card fields plus the body, the source link and the image credit. */
export interface ArticleDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** The AI-written summary (plain text; paragraphs are separated by newlines, or not at all). */
  body: string;
  /** Already normalized (https); null when the feed had no image. */
  imageUrl: string | null;
  /** Who the feed credited for the image; null when it named nobody. */
  imageCredit: string | null;
  category: CategoryId;
  tags: string[];
  sourceName: string;
  /** Link to the original story at the outlet. */
  sourceUrl: string;
  /**
   * Every outlet whose reporting fed this story, lead source first, for the "Source(s)" box at the
   * end of the article. Always has at least one entry (the lead source, same as sourceName/sourceUrl
   * above); more than one when another outlet's report of the same event was detected.
   */
  sources: { sourceName: string; sourceUrl: string }[];
  /** ISO 8601. */
  publishedAt: string;
  /** ISO 8601 of the last correction / re-categorization; null when the story was never changed. */
  correctedAt: string | null;
  isBreaking: boolean;
}
