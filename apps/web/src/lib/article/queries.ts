import { cache } from "react";
import type { CategoryId } from "@g12/config";
import { formatToday } from "../home/dates";
import { guarded, SELECT, toArticle, type Row } from "../home/queries";
import type { HomeArticle } from "../home/types";
import { isValidSlug } from "./slug";
import type { ArticleDetail } from "./types";

/**
 * Database reads and writes for /article/[slug] (server-only). Like the other loaders, `getArticle`
 * THROWS on a database error, so an outage shows the error page rather than a false "story not found".
 * With no DATABASE_URL at all (local UI work) it returns null.
 */

/** "Related stories" shows this many. */
export const RELATED_COUNT = 4;

const DETAIL_SELECT = { ...SELECT, body: true, imageCredit: true, sourceUrl: true, correctedAt: true } as const;

interface DetailRow extends Row {
  body: string;
  imageCredit: string | null;
  sourceUrl: string;
  correctedAt: Date | null;
}

function toDetail(row: DetailRow): ArticleDetail {
  const card = toArticle(row);
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    excerpt: card.excerpt,
    body: row.body,
    imageUrl: card.imageUrl,
    imageCredit: row.imageCredit?.trim() || null,
    category: card.category,
    tags: card.tags,
    sourceName: card.sourceName,
    sourceUrl: row.sourceUrl,
    publishedAt: card.publishedAt,
    correctedAt: row.correctedAt ? row.correctedAt.toISOString() : null,
    isBreaking: card.isBreaking,
  };
}

/**
 * One published story by its URL slug, or null (unknown slug, or a draft / rejected story, which are
 * never public). `cache` makes the page and its metadata share a single query per request.
 */
export const getArticle = cache(async (slug: string): Promise<ArticleDetail | null> => {
  if (!isValidSlug(slug)) return null;
  return guarded<ArticleDetail | null>(null, async (prisma) => {
    const row = await prisma.article.findFirst({ where: { slug, status: "PUBLISHED" }, select: DETAIL_SELECT });
    return row ? toDetail(row) : null;
  });
});

/** The newest other stories in the same category. Never throws: a failing side query must not take the article down with it. */
export const getRelatedArticles = cache(async (category: CategoryId, excludeId: string): Promise<HomeArticle[]> => {
  try {
    return await guarded<HomeArticle[]>([], async (prisma) => {
      const rows = await prisma.article.findMany({
        where: { status: "PUBLISHED", category, id: { not: excludeId } },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        take: RELATED_COUNT,
        select: SELECT,
      });
      return rows.map(toArticle);
    });
  } catch (error) {
    console.warn(`[article] could not load related stories: ${error instanceof Error ? error.message : error}`);
    return [];
  }
});

/**
 * Count one page view (feeds "Trending Now" and the category "most viewed" sort). One atomic
 * `SET viewCount = viewCount + 1`, so simultaneous readers are never lost. Never throws: a counter
 * problem must not affect the reader, who has already been served the page.
 *
 * The same view is also added to that story's count for today (Pakistan date), which is what the admin
 * dashboard's "most viewed today" reads: `viewCount` alone is a lifetime total and cannot say "today".
 */
export async function recordView(id: string): Promise<void> {
  try {
    await guarded<void>(undefined, async (prisma) => {
      const counted = await prisma.article.updateMany({ where: { id, status: "PUBLISHED" }, data: { viewCount: { increment: 1 } } });
      if (counted.count === 0) return;
      const day = formatToday(new Date()).iso;
      await prisma.$executeRaw`
        INSERT INTO "ArticleDailyView" ("articleId", "day", "views") VALUES (${id}, ${day}::date, 1)
        ON CONFLICT ("articleId", "day") DO UPDATE SET "views" = "ArticleDailyView"."views" + 1`;
    });
  } catch (error) {
    console.warn(`[article] could not count a view of ${id}: ${error instanceof Error ? error.message : error}`);
  }
}
