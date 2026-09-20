import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma skips its own .env loading when a config file exists, so load the shared root .env here.
// Silent no-op if the file is missing (CI/production set real environment variables instead).
config({ path: resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Not env() — that throws when unset, which would break `prisma generate` on a fresh checkout.
    url: process.env.DATABASE_URL ?? "",
  },
});
