import type { Metadata } from "next";
import { articlePath, CATEGORY_BY_ID, SITE } from "@g12/config";
import { SHARE_IMAGE } from "../brand";
import { wasUpdated } from "./time";
import type { ArticleDetail } from "./types";

/**
 * Search and social-sharing metadata for one story. The layout adds " | G12 News" to `title` and sets
 * `metadataBase`, which turns the relative canonical / og:url / fallback image below into absolute URLs.
 *
 * The share preview uses the story's own picture. A story with none is shared with the site's default
 * preview image instead, set explicitly here: Next.js does not carry the site-wide image over to a page
 * that defines its own Open Graph tags. (Full JSON-LD structured data is a separate step.)
 */
export function articleMetadata(article: ArticleDetail): Metadata {
  const category = CATEGORY_BY_ID[article.category];
  const canonical = articlePath(article.slug);
  const image = article.imageUrl;
  const modifiedTime = wasUpdated(article.publishedAt, article.correctedAt) ? (article.correctedAt ?? undefined) : undefined;

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical },
    openGraph: {
      type: "article",
      siteName: SITE.name,
      locale: "en_PK",
      url: canonical,
      title: article.title,
      description: article.excerpt,
      publishedTime: article.publishedAt,
      modifiedTime,
      section: category.name,
      tags: article.tags,
      images: image ? [{ url: image, alt: article.title }] : [{ url: SHARE_IMAGE.src, width: SHARE_IMAGE.width, height: SHARE_IMAGE.height, alt: SHARE_IMAGE.alt }],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [image ?? SHARE_IMAGE.src],
    },
  };
}
