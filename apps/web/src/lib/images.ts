import imageHosts from "../../image-hosts.json";

/** True if `hostname` matches an allowlist pattern (`example.com`, or `**.example.com` for subdomains). */
export function hostMatches(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const rule = pattern.toLowerCase();
  if (rule.startsWith("**.")) return host.endsWith(rule.slice(2)) && host.length > rule.length - 2;
  return host === rule;
}

/** Whether Next.js is configured to optimize images from this URL (mirrors `images.remotePatterns`). */
export function isOptimizableImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && imageHosts.hosts.some((pattern) => hostMatches(url.hostname, pattern));
  } catch {
    return false;
  }
}

// The feed-URL clean-up (https, BBC size, Geo path) lives in @g12/config so the worker applies it
// when storing a story and the site applies it again when showing one (older rows).
export { normalizeImageUrl } from "@g12/config";
