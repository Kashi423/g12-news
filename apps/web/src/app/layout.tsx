import type { Metadata, Viewport } from "next";
import { Inter, Merriweather } from "next/font/google";
import { SITE } from "@g12/config";
import { BreakingProvider } from "@/components/breaking/breaking-provider";
import { BreakingTicker } from "@/components/breaking/breaking-ticker";
import { ActiveCategoryProvider } from "@/components/layout/active-category";
import { PageEnhancements } from "@/components/layout/page-enhancements";
import { UtilityBar } from "@/components/layout/utility-bar";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getInitialBreaking } from "@/lib/breaking/queries";
import { OG_LOCALE } from "@/lib/seo/locale";
import { siteGraph } from "@/lib/seo/json-ld";
import { getSiteInfo } from "@/lib/seo/site";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

// Fonts are downloaded at build time and served from this site (nothing is requested from Google when a
// reader visits), and only the Latin letters are included. Inter is one variable file that covers every
// weight the site uses (400-700). Merriweather is only ever used for headlines at weights 700 and 900, so
// only those two are shipped, instead of the whole 300-900 range.
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Merriweather({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-serif", display: "swap" });

// Pages are static and regenerated in the background at most once a minute (ISR). The ticker's
// first paint therefore uses data up to a minute old; the live stream replaces it a moment after load.
export const revalidate = 60;

/**
 * Optional search-console verification: set GOOGLE_SITE_VERIFICATION and/or BING_SITE_VERIFICATION in .env
 * (the "content" value of the HTML-tag method) to prove you own the site. Nothing is emitted when unset.
 * (Verifying through a DNS record instead needs no code at all.)
 */
function verification(): Metadata["verification"] {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();
  if (!google && !bing) return undefined;
  return { ...(google ? { google } : {}), ...(bing ? { other: { "msvalidate.01": bing } } : {}) };
}

export const metadata: Metadata = {
  // Makes relative URLs in any page's metadata (canonical links, social tags) absolute. Set SITE_URL in .env.
  metadataBase: siteUrl(),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  // Every page names its own address as canonical ("./" = this page, without any ?query). Pages that know
  // better (a category page's filtered views, a story) set their own and replace this one.
  alternates: { canonical: "./" },
  // Site-wide social defaults, inherited by pages that set no Open Graph tags of their own (a story sets its own).
  openGraph: { type: "website", siteName: SITE.name, locale: OG_LOCALE, url: "./" },
  // Allow large picture previews in search results and Discover.
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
  verification: verification(),
};

export const viewport: Viewport = {
  themeColor: "#03388E",
  colorScheme: "only light",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // If the database is unavailable this is empty and the site simply renders without breaking stories.
  const { items, serverNow } = await getInitialBreaking();

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="flex min-h-screen flex-col">
        {/* Organization + WebSite (with the search action) on every page. */}
        <JsonLd data={siteGraph(getSiteInfo())} />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[60] focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to the stories
        </a>
        <BreakingProvider initial={items} serverNow={serverNow}>
          <ActiveCategoryProvider>
            <PageEnhancements />
            <UtilityBar />
            <BreakingTicker />
            <SiteHeader />
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <SiteFooter />
          </ActiveCategoryProvider>
        </BreakingProvider>
      </body>
    </html>
  );
}
