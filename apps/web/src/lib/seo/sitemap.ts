import type { MetadataRoute } from "next";
import { articlePath, categoryPath, CATEGORIES, SITE_PAGES, type CategoryId } from "@g12/config";

/**
 * The entries of sitemap.xml: the homepage, every category, the static pages and every published story.
 * Built from plain data so the rules (what is listed, what is not) can be tested without a database.
 * The search page and the API are deliberately absent: they are not pages to index.
 */

/** A sitemap file may hold 50,000 addresses; a few thousand are kept free for the fixed pages. */
export const SITEMAP_MAX_ARTICLES = 45_000;

export interface SitemapArticle {
  slug: string;
  /** When the story last changed: its correction time if it has one, else when it was published. */
  lastModified: Date;
}

export interface SitemapData {
  /** Newest first. */
  articles: readonly SitemapArticle[];
  /** Newest story per category; a category with no stories has no entry. */
  categoryUpdated: Partial<Record<CategoryId, Date>>;
}

export function buildSitemap(origin: string, data: SitemapData): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, origin).toString();
  const newest = data.articles.length > 0 ? data.articles.reduce((latest, article) => (article.lastModified > latest ? article.lastModified : latest), data.articles[0]!.lastModified) : undefined;

  const entries: MetadataRoute.Sitemap = [
    { url: url("/"), lastModified: newest, changeFrequency: "hourly", priority: 1 },
    ...CATEGORIES.map((category) => ({ url: url(categoryPath(category.slug)), lastModified: data.categoryUpdated[category.id], changeFrequency: "hourly" as const, priority: 0.8 })),
    ...SITE_PAGES.map((page) => ({ url: url(page.href), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];

  const seen = new Set(entries.map((entry) => entry.url));
  for (const article of data.articles.slice(0, SITEMAP_MAX_ARTICLES)) {
    const address = url(articlePath(article.slug));
    if (seen.has(address)) continue;
    seen.add(address);
    entries.push({ url: address, lastModified: article.lastModified, priority: 0.6 });
  }
  return entries;
}
