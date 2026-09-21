/**
 * Which requests count as a reader for the view counter.
 *
 * "Trending Now" ranks by views, so views should be people. Link previews (WhatsApp, Facebook, X and
 * friends fetch a page the moment someone shares it), search-engine crawlers, uptime monitors and
 * scripts are all skipped, as are browser and Next.js prefetches: the reader has not opened the story
 * yet. A request that does not name a browser at all is skipped too.
 */

// Every browser (Chrome, Safari, Firefox, Edge, the in-app browsers of Facebook, WhatsApp and the like)
// starts its User-Agent with "Mozilla/"; Opera Mini alone uses "Opera/". Scripts and libraries (Node's
// fetch says just "node", curl says "curl/...") do not, so anything else is not a reader.
const LOOKS_LIKE_A_BROWSER = /^(?:Mozilla|Opera)\//;

// Crawlers and preview fetchers often pose as a browser too ("Mozilla/5.0 (compatible; Googlebot/2.1)").
// Preview fetchers mostly announce themselves with "bot" (Twitterbot, TelegramBot, LinkedInBot, Slackbot,
// Discordbot) or "preview"; Facebook and WhatsApp use their own names. Names of the apps themselves are
// deliberately NOT listed: their in-app browsers are readers.
const NOT_A_READER = new RegExp(
  [
    "bot", "crawl", "spider", "slurp", "scrape", "fetch", "preview", "facebookexternalhit", "whatsapp", "embedly",
    "vkshare", "headless", "lighthouse", "pingdom", "uptime", "monitor", "curl", "wget", "python", "axios", "go-http",
    "java/", "okhttp", "libwww", "httpclient", "scrapy", "postman",
  ].join("|"),
  "i",
);

export interface RequestHeaders {
  get(name: string): string | null;
}

export function shouldCountView(headers: RequestHeaders): boolean {
  if (headers.get("next-router-prefetch")) return false;
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender")) return false;
  const userAgent = headers.get("user-agent")?.trim();
  if (!userAgent || !LOOKS_LIKE_A_BROWSER.test(userAgent)) return false;
  return !NOT_A_READER.test(userAgent);
}
