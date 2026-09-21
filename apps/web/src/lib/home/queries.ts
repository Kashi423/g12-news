import { cache } from "react";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { CategoryId } from "@g12/config";
import { normalizeImageUrl } from "../images";
import { FEATURED_POOL_SIZE, TRENDING_COUNT } from "./ranking";
import type { HomeArticle } from "./types";

/**
 * Database reads for the homepage (server-only).
 *
 * The page is regenerated in the background every 60 seconds (ISR). If a regeneration throws, Next.js
 * keeps serving the last good page, so on a database error these loaders THROW rather than return
 * an empty list: a brief outage must never replace a good homepage with an empty one.
 * Two cases stay quiet: no DATABASE_URL at all (local UI work) and `next build` without a reachable
 * database; both render the empty state.
 */

export const SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  imageUrl: true,
  category: true,
  tags: true,
  sourceName: true,
  publishedAt: true,
  urgencyScore: true,
  isBreaking: true,
} as const;

export interface Row {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  category: string;
  tags: string[];
  sourceName: string;
  publishedAt: Date;
  urgencyScore: number;
  isBreaking: boolean;
}

// Fields are copied one by one (not spread), so a caller that selected an extra column cannot leak it into a card.
export function toArticle(row: Row): HomeArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    imageUrl: normalizeImageUrl(row.imageUrl),
    category: row.category as CategoryId,
    tags: row.tags,
    sourceName: row.sourceName,
    publishedAt: row.publishedAt.toISOString(),
    urgencyScore: row.urgencyScore,
    isBreaking: row.isBreaking,
  };
}

export async function guarded<T>(empty: T, read: (prisma: (typeof import("@g12/db"))["prisma"]) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) return empty;
  try {
    const { prisma } = await import("@g12/db");
    return await read(prisma);
  } catch (error) {
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return empty;
    throw error;
  }
}

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

/** The latest published stories (last 72 hours): the hero and its side stories are picked from these. */
export const getFeaturedPool = cache(async (): Promise<HomeArticle[]> =>
  guarded([], async (prisma) => {
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED", publishedAt: { gte: ago(72) } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: FEATURED_POOL_SIZE,
      select: SELECT,
    });
    return rows.map(toArticle);
  }),
);

/** The latest published stories in one category (a few more than the section shows, so featured ones can be skipped). */
export const getCategoryArticles = cache(async (category: CategoryId): Promise<HomeArticle[]> =>
  guarded([], async (prisma) => {
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED", category },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: 14,
      select: SELECT,
    });
    return rows.map(toArticle);
  }),
);

/**
 * Trending: the most-viewed stories published in the last 24 hours. `viewCount` is a running total
 * (nothing increments it until the article page exists), so ties, which is everything for now, fall
 * back to urgency and then recency.
 */
export const getTrending = cache(async (): Promise<HomeArticle[]> =>
  guarded([], async (prisma) => {
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED", publishedAt: { gte: ago(24) } },
      orderBy: [{ viewCount: "desc" }, { urgencyScore: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
      take: TRENDING_COUNT,
      select: SELECT,
    });
    return rows.map(toArticle);
  }),
);
