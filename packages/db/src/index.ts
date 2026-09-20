import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Models, enums (Category, ArticleStatus) and types, e.g. `import { Category, type Article } from "@g12/db"`.
export * from "./generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  // Optional cap on pooled connections (handy on small managed Postgres plans); the driver default is 10.
  const max = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(max > 0 ? { max } : {}) }) });
}

// Reuse one client across hot reloads in `next dev` so we don't exhaust database connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = (globalForPrisma.prisma ??= createPrismaClient());
