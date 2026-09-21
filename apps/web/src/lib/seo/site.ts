import { DEV_SITE_URL, siteUrl } from "../site-url";
import { contactEmail } from "../contact";

/**
 * Everything the search-engine work needs to know about the site itself, in one place: its public address
 * (SITE_URL), its logo, its social profiles and its contact address. Nothing here is invented: a social
 * profile or contact address that has not been configured is simply left out of the structured data.
 */

/** The 512 x 512 logo image (src/app/icon.jpg, served at /icon.jpg): square, on white, well above Google's 112 px minimum. */
export const SITE_LOGO = { path: "/icon.jpg", width: 512, height: 512 } as const;

/** An absolute address on this site, e.g. `absoluteUrl("/about")` -> "https://g12news.com/about". */
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

export function siteOrigin(): string {
  return siteUrl().origin;
}

/** True while SITE_URL is unset (or not an http(s) address), so every absolute address points at localhost. */
export function usesLocalAddress(): boolean {
  return siteUrl().origin === new URL(DEV_SITE_URL).origin;
}

let warned = false;
/** Logs once when a production process is about to publish localhost addresses (sitemap, canonical links, share links). */
export function warnIfLocalAddress(what: string): void {
  if (warned || process.env.NODE_ENV !== "production" || !usesLocalAddress()) return;
  warned = true;
  console.warn(`[seo] SITE_URL is not set, so ${what} say ${DEV_SITE_URL}. Set SITE_URL in .env (for example https://g12news.com) before you deploy.`);
}

/** Social profile addresses the operator has really configured (never the networks' home-page fallbacks). */
export function configuredSocialUrls(env: Record<string, string | undefined> = process.env): string[] {
  return [env.NEXT_PUBLIC_FACEBOOK_URL, env.NEXT_PUBLIC_X_URL, env.NEXT_PUBLIC_WHATSAPP_URL]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value && /^https?:\/\//i.test(value));
}

export interface SiteInfo {
  /** e.g. "https://g12news.com" (no trailing slash). */
  origin: string;
  logoUrl: string;
  sameAs: string[];
  contactEmail: string | null;
}

export function getSiteInfo(): SiteInfo {
  return { origin: siteOrigin(), logoUrl: absoluteUrl(SITE_LOGO.path), sameAs: configuredSocialUrls(), contactEmail: contactEmail() };
}
