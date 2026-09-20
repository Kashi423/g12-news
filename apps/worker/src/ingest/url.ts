import { createHash } from "node:crypto";

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_|cmpid$|ocid$|xtor$|smid$|igshid$|spm$|at_)/i;

/**
 * Canonical form of an article link, used as the dedupe key (Article.sourceUrl):
 * no fragment, no tracking parameters, lower-cased host, no trailing slash.
 * Returns null for anything that is not an http(s) URL.
 */
export function canonicalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return null;
  }
}

export function slugify(input: string, maxLength = 80): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

export function shortHash(input: string, length = 6): string {
  return createHash("sha1").update(input).digest("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, length);
}

/** First free slug: the base, then base + a hash of the source URL, then numbered variants. */
export async function uniqueSlug(base: string, sourceUrl: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = base || "story";
  if (!(await exists(root))) return root;
  const hashed = `${root.slice(0, 72).replace(/-+$/, "")}-${shortHash(sourceUrl)}`;
  if (!(await exists(hashed))) return hashed;
  for (let n = 2; n < 10; n++) {
    if (!(await exists(`${hashed}-${n}`))) return `${hashed}-${n}`;
  }
  return `${hashed}-${Date.now().toString(36)}`;
}
