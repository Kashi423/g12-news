import { resolve } from "node:path";
import nextEnv from "@next/env";
import imageHosts from "./image-hosts.json" with { type: "json" };

// Next.js only reads .env files from this app's directory. Load the shared root .env as well
// so the web app, the worker and Prisma all use one file. The last argument (forceReload) matters:
// Next has already loaded its own env by now, and without it this call would silently do nothing.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../.."), process.env.NODE_ENV === "development", console, true);

const DAY = 60 * 60 * 24;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not announce "X-Powered-By: Next.js" on every response.
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; let Next compile them. (@g12/worker: the admin dashboard's
  // "Fetch now" runs the worker's own ingestion code, see apps/worker/src/admin.ts.)
  transpilePackages: ["@g12/config", "@g12/db", "@g12/worker"],
  // The live-news stream keeps a raw Postgres connection (LISTEN/NOTIFY); leave the driver unbundled.
  serverExternalPackages: ["pg"],
  images: {
    // Only these hosts are fetched and optimized (see image-hosts.json); any other host's image is
    // served unoptimized by <ArticleImage>, so the optimizer cannot be used as an open proxy.
    remotePatterns: imageHosts.hosts.map((hostname) => ({ protocol: "https", hostname })),
    // Story pictures are mostly small cards on phones (about 285 CSS pixels wide, 500 device pixels).
    // The default width steps jump from 384 straight to 640, which is 25-60% more picture than a card
    // needs, so 512 and a few in-between small steps are added. Two quality levels: 60 for cards, 75 for
    // the big top-of-page picture. Every allowed width and quality is another cached copy, so the lists stay short.
    deviceSizes: [384, 512, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [96, 160, 224, 320],
    qualities: [60, 75],
    // A story's picture never changes after it is published, so resized copies are kept for a day
    // (the default is four hours), which means fewer times the outlet's server is asked again.
    minimumCacheTTL: DAY,
  },
  async headers() {
    // When several rules match one file the LAST one wins, so the general rule comes first.
    return [
      {
        // The owner's dashboard and its data: never stored by any cache or browser history, never indexed.
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // The logo files keep their names when regenerated, so they are cached for a day and re-checked.
        source: "/brand/:file",
        headers: [{ key: "Cache-Control", value: `public, max-age=${DAY}, stale-while-revalidate=${DAY * 7}` }],
      },
      {
        // The logo crop's file name carries a hash of its content, so a changed logo is a new address:
        // it can be kept for a year.
        source: "/brand/g12-news-logo-crop.:hash.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // The site's own pictures (generated from files in src/app) change only when the logo does: a day is
        // plenty, and a share preview re-fetches them each time somebody shares a link with no picture.
        source: "/:file(icon.jpg|apple-icon.jpg|opengraph-image.jpg)",
        headers: [{ key: "Cache-Control", value: `public, max-age=${DAY}, stale-while-revalidate=${DAY * 7}` }],
      },
      {
        // A category page is the same for every reader, like the homepage (which is cached for a minute), so a
        // shared cache in front of the site may keep it for a minute too. Story pages are NOT cached like this
        // on purpose: every visit to one is counted as a view.
        source: "/category/:slug",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300" }],
      },
      {
        // Story and search pages are built for every visit (a story visit is counted as a view), so a shared
        // cache must never keep them (private). Next.js would add "no-store", which also stops the browser's
        // Back button from restoring the page instantly (the back/forward cache); "no-cache" keeps every
        // ordinary reload fresh but allows that.
        source: "/article/:slug",
        headers: [{ key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" }],
      },
      {
        source: "/search",
        headers: [{ key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" }],
      },
      {
        // Both are built per request (see their files); a shared cache in front of the site may keep them briefly.
        source: "/sitemap.xml",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=300, stale-while-revalidate=600" }],
      },
      {
        source: "/robots.txt",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" }],
      },
    ];
  },
  async redirects() {
    return [
      // The Miscellaneous category's address is /category/miscellaneous (its slug in packages/config, used
      // by the footer and every link). "misc" is the short form people type, so send it to the real one.
      { source: "/category/misc", destination: "/category/miscellaneous", permanent: true },
    ];
  },
};

export default nextConfig;
