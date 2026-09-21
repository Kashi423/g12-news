/**
 * `url` if it is an http(s) address, otherwise null. The source link comes from a feed and is stored as
 * text, so a `javascript:` or `data:` address must never reach an href, whatever the database holds.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
