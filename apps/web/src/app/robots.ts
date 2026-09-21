import type { MetadataRoute } from "next";
import { absoluteUrl, warnIfLocalAddress } from "@/lib/seo/site";

/**
 * Everything may be crawled, and the sitemap is announced. The one exception is /api/: it holds data
 * endpoints, not pages (one of them is a live stream that would hold a crawler's connection open).
 * /search is NOT blocked: its pages say "noindex" themselves, and a crawler blocked here could not see that.
 * Built per request (not at build time) so the sitemap address is the deployed SITE_URL.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  warnIfLocalAddress("robots.txt's sitemap address");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
