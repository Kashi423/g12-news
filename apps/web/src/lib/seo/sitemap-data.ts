import type { CategoryId } from "@g12/config";
import { guarded } from "../home/queries";
import { SITEMAP_MAX_ARTICLES, type SitemapData } from "./sitemap";

/**
 * What the sitemap lists, read from the database (server-only): every PUBLISHED story, newest first,
 * with the time it last changed. Drafts and rejected stories are never listed. Like the other loaders it
 * THROWS on a database error, so Next.js keeps serving the previous good sitemap instead of an empty one.
 */
export async function getSitemapData(): Promise<SitemapData> {
  return guarded<SitemapData>({ articles: [], categoryUpdated: {} }, async (prisma) => {
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      // One more than the file can hold, so a truncation can be noticed and reported.
      take: SITEMAP_MAX_ARTICLES + 1,
      select: { slug: true, category: true, publishedAt: true, correctedAt: true },
    });
    if (rows.length > SITEMAP_MAX_ARTICLES) {
      console.warn(`[seo] more than ${SITEMAP_MAX_ARTICLES} stories: the sitemap lists the newest ${SITEMAP_MAX_ARTICLES}. Split it into several sitemaps (generateSitemaps) and list them in a sitemap index.`);
    }

    const articles = rows.slice(0, SITEMAP_MAX_ARTICLES).map((row) => ({
      slug: row.slug,
      category: row.category as CategoryId,
      lastModified: row.correctedAt && row.correctedAt > row.publishedAt ? row.correctedAt : row.publishedAt,
    }));
    const categoryUpdated: Partial<Record<CategoryId, Date>> = {};
    for (const article of articles) {
      const current = categoryUpdated[article.category];
      if (!current || article.lastModified > current) categoryUpdated[article.category] = article.lastModified;
    }
    return { articles: articles.map(({ slug, lastModified }) => ({ slug, lastModified })), categoryUpdated };
  });
}
