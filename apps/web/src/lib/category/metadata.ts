import type { Metadata } from "next";
import { categoryPath, SITE, type CategoryDef } from "@g12/config";
import type { CategoryQuery } from "./query";

/**
 * Search and social metadata for a category page. The layout adds " | G12 News" to `title` and sets
 * `metadataBase`, which is what turns the relative canonical below into an absolute URL.
 */

/** "imran khan" -> "Imran Khan": each word capitalised, for a page title. */
function titleCase(text: string): string {
  return text.replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
}

export function categoryTitle(category: CategoryDef, tag: string | null = null): string {
  if (!tag) return `${category.name} News: Latest Headlines`;
  return `${titleCase(tag)} in ${category.name} News`;
}

/** One sentence (kept under Google's ~160 characters, which a test enforces for all nine categories). */
export function categoryDescription(category: CategoryDef): string {
  return `${category.tagline}. Latest ${category.name} headlines on ${SITE.name}, updated as stories break.`;
}

export function categoryMetadata(category: CategoryDef, query: CategoryQuery): Metadata {
  const title = categoryTitle(category, query.tag);
  const description = categoryDescription(category);
  // Every version of the page (a topic filter, "most viewed", page 2...) names the plain category
  // page as canonical. They list the same stories in another arrangement, so search engines should
  // consolidate them onto one URL. Readers still get the exact page they linked to.
  const canonical = categoryPath(category.slug);

  // No openGraph / twitter here on purpose. Metadata merges shallowly, so setting them would replace the
  // site-wide social image (app/opengraph-image.jpg) with nothing. Left out, Next.js builds og:title and
  // og:description from the title and description above and keeps the site image.
  return { title, description, alternates: { canonical } };
}
