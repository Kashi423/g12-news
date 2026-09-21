import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap";
import { getSitemapData } from "@/lib/seo/sitemap-data";
import { siteOrigin, warnIfLocalAddress } from "@/lib/seo/site";

// Generated from the database on request, never a file to maintain by hand: a new story is in the sitemap
// as soon as it is published. It is deliberately NOT prerendered at build time: a build has neither the
// deployed SITE_URL nor necessarily a database, and a crawler must never be handed that snapshot. Caches
// in front of the site keep it cheap (see the /sitemap.xml rule in next.config.mjs).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  warnIfLocalAddress("the sitemap's addresses");
  return buildSitemap(siteOrigin(), await getSitemapData());
}
