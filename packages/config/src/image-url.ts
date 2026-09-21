/**
 * Clean up an image URL taken from an RSS feed so it actually loads. Used by the worker when it
 * stores a story and by the website when it shows one (safe to apply twice), so stories stored
 * before a rule existed are fixed too.
 *
 * - only http(s); always https (an https page cannot show plain-http images, and every outlet we
 *   checked redirects http to https)
 * - BBC: the feed's 240px thumbnails become the 976px version, so they stay sharp in large slots
 * - Geo News: the feed omits the `updates/` folder, and the URL it advertises redirects to the home
 *   page instead of serving the picture (its own article pages use the `updates/` form)
 */
export function normalizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  const host = url.hostname.toLowerCase();
  if (host === "ichef.bbci.co.uk") {
    url.pathname = url.pathname.replace(/^\/ace\/standard\/\d+\//, "/ace/standard/976/");
  } else if (host === "www.geo.tv" || host === "geo.tv") {
    url.pathname = url.pathname.replace(/^\/assets\/uploads\/(?=\d{4}-\d{2}-\d{2}\/)/, "/assets/uploads/updates/");
  }
  return url.toString();
}
