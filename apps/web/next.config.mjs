import { resolve } from "node:path";
import nextEnv from "@next/env";

// Next.js only reads .env files from this app's directory. Load the shared root .env as well
// so the web app, the worker and Prisma all use one file.
nextEnv.loadEnvConfig(resolve(import.meta.dirname, "../.."));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ["@g12/config", "@g12/db"],
};

export default nextConfig;
