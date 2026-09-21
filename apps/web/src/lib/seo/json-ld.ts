import { articlePath, categoryPath, CATEGORY_BY_ID, SITE } from "@g12/config";
import type { ArticleDetail } from "../article/types";
import { SHARE_IMAGE } from "../brand";
import { SITE_LOGO, type SiteInfo } from "./site";

/**
 * schema.org structured data (JSON-LD), built as plain objects so it can be tested without a browser.
 *
 * Honesty is part of the design: the author of every story is the Organization "G12 News" (never a
 * person, because no person wrote it), and a story says what it was based on (`isBasedOn`: the outlet's
 * original report), so the markup describes what the page really is.
 */

type Json = Record<string, unknown>;

/** Google shows headlines up to about 110 characters. */
const HEADLINE_MAX = 110;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * JSON for a <script type="application/ld+json"> tag. Headlines and excerpts come from news feeds and an
 * AI, so `<` is escaped (a title containing "</script>" must never end the tag), as are the two line
 * separators that JavaScript, but not JSON, treats as line breaks.
 */
export function jsonLdString(data: unknown): string {
  // Built from character codes, never written as backslash sequences or literal separators: written literally,
  // JavaScript would read U+2028 / U+2029 as line breaks in this very file.
  const backslash = String.fromCharCode(0x5c);
  const lineSeparator = String.fromCharCode(0x2028);
  const paragraphSeparator = String.fromCharCode(0x2029);
  return JSON.stringify(data)
    .split("<").join(backslash + "u003c")
    .split(lineSeparator).join(backslash + "u2028")
    .split(paragraphSeparator).join(backslash + "u2029");
}

/** The publisher, as it appears inside a story: name, address and logo. */
function publisherOf(site: SiteInfo): Json {
  return {
    "@type": "Organization",
    "@id": `${site.origin}/#organization`,
    name: SITE.name,
    url: site.origin,
    logo: { "@type": "ImageObject", url: site.logoUrl, width: SITE_LOGO.width, height: SITE_LOGO.height },
  };
}

/** Organization + WebSite (with a SearchAction), for the root layout, so every page carries them. */
export function siteGraph(site: SiteInfo): Json {
  const organization: Json = {
    "@type": "Organization",
    "@id": `${site.origin}/#organization`,
    name: SITE.name,
    url: site.origin,
    description: SITE.description,
    logo: { "@type": "ImageObject", url: site.logoUrl, width: SITE_LOGO.width, height: SITE_LOGO.height },
    publishingPrinciples: `${site.origin}/about`,
    ...(site.sameAs.length > 0 ? { sameAs: site.sameAs } : {}),
    ...(site.contactEmail ? { contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: site.contactEmail } } : {}),
  };
  const website: Json = {
    "@type": "WebSite",
    "@id": `${site.origin}/#website`,
    url: site.origin,
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en",
    publisher: { "@id": `${site.origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      // The placeholder's name must match the one in `query-input`.
      target: { "@type": "EntryPoint", urlTemplate: `${site.origin}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  return { "@context": "https://schema.org", "@graph": [organization, website] };
}

/** The picture named in a story's share tags and structured data: our resized copy of it, or the site image. */
export function articleImageUrl(article: Pick<ArticleDetail, "slug" | "imageUrl">, site: Pick<SiteInfo, "origin">): string {
  return article.imageUrl ? `${site.origin}${articlePath(article.slug)}/share.jpg` : `${site.origin}${SHARE_IMAGE.src}`;
}

/** NewsArticle markup for a story page. */
export function newsArticleSchema(article: ArticleDetail, site: SiteInfo): Json {
  const url = `${site.origin}${articlePath(article.slug)}`;
  const category = CATEGORY_BY_ID[article.category];
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: clip(article.title, HEADLINE_MAX),
    description: article.excerpt,
    image: [articleImageUrl(article, site)],
    datePublished: article.publishedAt,
    // A story that was never corrected was last modified when it was published.
    dateModified: article.correctedAt ?? article.publishedAt,
    author: { "@type": "Organization", name: SITE.name, url: site.origin },
    publisher: publisherOf(site),
    articleSection: category.name,
    ...(article.tags.length > 0 ? { keywords: article.tags.join(", ") } : {}),
    inLanguage: "en",
    isAccessibleForFree: true,
    // The outlet whose reporting this summary is based on.
    isBasedOn: { "@type": "NewsArticle", url: article.sourceUrl, publisher: { "@type": "Organization", name: article.sourceName } },
  };
}

export interface Crumb {
  name: string;
  /** Absolute address. */
  url: string;
}

/** BreadcrumbList markup: the trail from the homepage down to the current page. */
export function breadcrumbSchema(crumbs: readonly Crumb[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({ "@type": "ListItem", position: index + 1, name: crumb.name, item: crumb.url })),
  };
}

/** Home > Category (a category page). */
export function categoryBreadcrumbs(categoryId: ArticleDetail["category"], site: Pick<SiteInfo, "origin">): Crumb[] {
  const category = CATEGORY_BY_ID[categoryId];
  return [
    { name: "Home", url: `${site.origin}/` },
    { name: category.name, url: `${site.origin}${categoryPath(category.slug)}` },
  ];
}

/** Home > Category > Story (a story page). */
export function articleBreadcrumbs(article: Pick<ArticleDetail, "category" | "slug" | "title">, site: Pick<SiteInfo, "origin">): Crumb[] {
  return [...categoryBreadcrumbs(article.category, site), { name: clip(article.title, HEADLINE_MAX), url: `${site.origin}${articlePath(article.slug)}` }];
}
