import type { Metadata, Viewport } from "next";
import { Inter, Merriweather } from "next/font/google";
import { SITE } from "@g12/config";
import { BreakingProvider } from "@/components/breaking/breaking-provider";
import { BreakingTicker } from "@/components/breaking/breaking-ticker";
import { UtilityBar } from "@/components/layout/utility-bar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getInitialBreaking } from "@/lib/breaking/queries";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Merriweather({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

// Pages are static and regenerated in the background at most once a minute (ISR). The ticker's
// first paint therefore uses data up to a minute old; the live stream replaces it a moment after load.
export const revalidate = 60;

export const metadata: Metadata = {
  // Makes relative URLs in any page's metadata (canonical links, social tags) absolute. Set SITE_URL in .env.
  metadataBase: siteUrl(),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
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
        <BreakingProvider initial={items} serverNow={serverNow}>
          <UtilityBar />
          <BreakingTicker />
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </BreakingProvider>
      </body>
    </html>
  );
}
