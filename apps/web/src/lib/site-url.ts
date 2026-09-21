/** Where the site is served from when SITE_URL is not set (`npm run dev`). */
export const DEV_SITE_URL = "http://localhost:3000";

/**
 * The site's public address, from SITE_URL in `.env` (for example https://g12news.com). Canonical
 * links and social-sharing tags need an absolute address, and only the operator knows it. Anything
 * missing or not an http(s) address falls back to the local development address.
 */
export function parseSiteUrl(raw: string | undefined): URL {
  const value = raw?.trim();
  if (value) {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") return url;
    } catch {
      // fall through to the default
    }
  }
  return new URL(DEV_SITE_URL);
}

export function siteUrl(): URL {
  return parseSiteUrl(process.env.SITE_URL);
}
