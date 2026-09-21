import type { Metadata } from "next";
import { articlePath, CATEGORY_BY_ID, SITE } from "@g12/config";
import { SHARE_IMAGE } from "../brand";
import { OG_LOCALE } from "../seo/locale";
import { SHARE_HEIGHT, SHARE_WIDTH } from "../seo/share-image-size";
import { wasUpdated } from "./time";
import type { ArticleDetail } from "./types";

/**
 * Search and social-sharing metadata for one story. The layout adds " | G12 News" to `title` and sets
 * `metadataBase`, which turns the relative canonical / og:url / image addresses below into absolute URLs.
 * (The story's structured data, JSON-LD, is rendered by the page itself: see lib/seo/json-ld.ts.)
 *
 * The share preview is /article/<slug>/share.jpg: the story's own picture, resized to exactly 1200 x 630
 * and re-encoded as a small JPEG, because outlets' own pictures are often too large (over WhatsApp's
 * ~300 KB limit) or in a format some crawlers cannot read. A story with no picture is shared with the
 * site's default image instead, set explicitly here: Next.js does not carry the site-wide image over to a
 * page that defines its own Open Graph tags.
 */
export function articleMetadata(article: ArticleDetail): Metadata {
  const category = CATEGORY_BY_ID[article.category];
  const canonical = articlePath(article.slug);
  const modifiedTime = wasUpdated(article.publishedAt, article.correctedAt) ? (article.correctedAt ?? undefined) : undefined;
  const image = article.imageUrl
    ? { url: `${canonical}/share.jpg`, width: SHARE_WIDTH, height: SHARE_HEIGHT, type: "image/jpeg", alt: article.title }
    : { url: SHARE_IMAGE.src, width: SHARE_IMAGE.width, height: SHARE_IMAGE.height, type: "image/jpeg", alt: SHARE_IMAGE.alt };

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical },
    // The desk, not a person: every story is written by an AI (see the byline on the page).
    authors: [{ name: SITE.name }],
    openGraph: {
      type: "article",
      siteName: SITE.name,
      locale: OG_LOCALE,
      url: canonical,
      title: article.title,
      description: article.excerpt,
      publishedTime: article.publishedAt,
      modifiedTime,
      section: category.name,
      tags: article.tags,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.excerpt,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
