import type { CategoryId } from "@g12/config";

/** A story as the homepage cards see it. */
export interface HomeArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  /** Already normalized (https); null when the feed had no image. */
  imageUrl: string | null;
  category: CategoryId;
  tags: string[];
  sourceName: string;
  /** ISO 8601. */
  publishedAt: string;
  urgencyScore: number;
  isBreaking: boolean;
}
