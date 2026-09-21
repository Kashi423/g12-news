import { CATEGORY_BY_ID, type CategoryDef, type CategoryId } from "./categories";

/** Where a category's page lives (apps/web/src/app/category/[slug]). */
export function categoryPath(slug: string): string {
  return `/category/${slug}`;
}

/** Categories in the main navigation, in order. (Miscellaneous is reachable from the footer only.) */
export const PRIMARY_NAV_CATEGORY_IDS = ["PAKISTAN", "WORLD", "POLITICS", "BUSINESS", "SPORTS", "SHOWBIZ", "TECHNOLOGY", "HEALTH"] as const satisfies readonly CategoryId[];

/** Categories that get a horizontal section on the homepage, in order. */
export const HOMEPAGE_SECTION_IDS = ["PAKISTAN", "WORLD", "SPORTS", "BUSINESS", "SHOWBIZ", "TECHNOLOGY", "HEALTH"] as const satisfies readonly CategoryId[];

export const PRIMARY_NAV_CATEGORIES: readonly CategoryDef[] = PRIMARY_NAV_CATEGORY_IDS.map((id) => CATEGORY_BY_ID[id]);
export const HOMEPAGE_SECTIONS: readonly CategoryDef[] = HOMEPAGE_SECTION_IDS.map((id) => CATEGORY_BY_ID[id]);

/** The static pages (apps/web/src/app/<name>/page.tsx), linked from the footer; the menu lists About and Contact. */
export const SITE_PAGES = [
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "Privacy", href: "/privacy" },
  { label: "Disclaimer", href: "/disclaimer" },
] as const;
