import { Prisma, prisma } from "@g12/db";
import { parseSwitch, SETTING_REQUIRE_REVIEW, type CategoryId } from "@g12/config";
import type { IngestStore } from "./store";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** IngestStore backed by the shared Prisma client (needs DATABASE_URL). */
export function createPrismaStore(): IngestStore {
  const store: IngestStore = {
    async listActiveSources() {
      const rows = await prisma.source.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, name: r.name, rssUrl: r.rssUrl, category: r.category as CategoryId, lastFetchedAt: r.lastFetchedAt }));
    },

    async findExistingUrls(urls) {
      const found = new Set<string>();
      for (let i = 0; i < urls.length; i += 500) {
        const rows = await prisma.article.findMany({ where: { sourceUrl: { in: urls.slice(i, i + 500) } }, select: { sourceUrl: true } });
        for (const row of rows) found.add(row.sourceUrl);
      }
      return found;
    },

    async recentPublished(limit) {
      return prisma.article.findMany({
        where: { status: { in: ["PUBLISHED", "PENDING_REVIEW"] } },
        orderBy: { publishedAt: "desc" },
        take: limit,
        select: { id: true, title: true },
      });
    },

    async slugExists(slug) {
      return (await prisma.article.findUnique({ where: { slug }, select: { id: true } })) !== null;
    },

    async createArticle(article) {
      try {
        const row = await prisma.article.create({ data: article, select: { id: true } });
        return { ok: true, id: row.id };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return { ok: false, conflict: (await store.slugExists(article.slug)) ? "slug" : "url" };
      }
    },

    async requireReview() {
      // A fresh read every call: this is what makes flipping the switch take effect without a restart.
      const row = await prisma.setting.findUnique({ where: { key: SETTING_REQUIRE_REVIEW }, select: { value: true } });
      return parseSwitch(row?.value);
    },

    async touchSource(id, update) {
      await prisma.source.update({ where: { id }, data: { ...update, ...(update.lastError === null ? { lastSuccessAt: update.lastFetchedAt } : {}) } });
    },

    async writeLog(entry) {
      await prisma.ingestLog.create({ data: entry });
    },
  };
  return store;
}
