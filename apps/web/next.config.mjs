import { resolve } from "node:path";
import nextEnv from "@next/env";
import imageHosts from "./image-hosts.json" with { type: "json" };

// Next.js only reads .env files from this app's directory. Load the shared root .env as well
// so the web app, the worker and Prisma all use one file.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../.."));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ["@g12/config", "@g12/db"],
  // The live-news stream keeps a raw Postgres connection (LISTEN/NOTIFY); leave the driver unbundled.
  serverExternalPackages: ["pg"],
  images: {
    // Only these hosts are fetched and optimized (see image-hosts.json); any other host's image is
    // served unoptimized by <ArticleImage>, so the optimizer cannot be used as an open proxy.
    remotePatterns: imageHosts.hosts.map((hostname) => ({ protocol: "https", hostname })),
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
