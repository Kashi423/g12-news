import { Prisma, prisma } from "@g12/db";
import { parseSwitch, SETTING_REQUIRE_REVIEW, type CategoryId } from "@g12/config";
import type { IngestStore } from "./store";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Setting keys the AI usage counters live under; persisted so /admin can show cumulative usage across restarts. */
const USAGE_KEYS = { calls: "aiUsage:calls", inputTokens: "aiUsage:inputTokens", outputTokens: "aiUsage:outputTokens" } as const;

/** IngestStore backed by the shared Prisma client (needs DATABASE_URL). */
export function createPrismaStore(): IngestStore {
  const store: IngestStore = {
    async listActiveSources() {
      const rows = await prisma.source.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
      return rows.map((r) => ({ id: r.id, name: r.name, rssUrl: r.rssUrl, category: r.category as CategoryId, lastFetchedAt: r.lastFetchedAt, reliability: r.reliability }));
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

    async attachSource(articleId, category, snippet) {
      return prisma.$transaction(async (tx) => {
        const article = await tx.article.findUniqueOrThrow({ where: { id: articleId }, select: { clusterId: true, body: true } });
        let clusterId = article.clusterId;
        if (!clusterId) {
          const cluster = await tx.storyCluster.create({ data: { category }, select: { id: true } });
          clusterId = cluster.id;
          await tx.article.update({ where: { id: articleId }, data: { clusterId } });
        }
        let added = true;
        try {
          await tx.clusterSource.create({
            data: { clusterId, sourceId: snippet.sourceId, sourceName: snippet.sourceName, url: snippet.url, guid: snippet.guid, title: snippet.title, description: snippet.description, publishedAt: snippet.publishedAt },
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error; // this exact URL is already attached: fine, just report what the cluster already has
          added = false;
        }
        const rows = await tx.clusterSource.findMany({ where: { clusterId }, orderBy: { publishedAt: "desc" }, include: { source: { select: { reliability: true } } } });
        const sources = rows.map((row) => ({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          url: row.url,
          guid: row.guid,
          title: row.title,
          description: row.description,
          publishedAt: row.publishedAt,
          reliability: row.source.reliability,
        }));
        return { clusterId, added, sources, articleBody: article.body };
      });
    },

    async updateVerification(articleId, update) {
      await prisma.article.update({
        where: { id: articleId },
        data: {
          qualityScore: update.qualityScore,
          verification: update.verification as Prisma.InputJsonValue,
          developing: update.developing,
          ...(update.touchedContent ? { contentUpdatedAt: new Date() } : {}),
        },
      });
    },

    async recordAiUsage(usage) {
      await prisma.$transaction(
        (Object.entries(USAGE_KEYS) as [keyof typeof usage, string][])
          .filter(([field]) => usage[field] !== 0)
          .map(([field, key]) => prisma.$executeRaw`
            INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (${key}, ${String(usage[field])}, NOW())
            ON CONFLICT ("key") DO UPDATE SET "value" = (COALESCE("Setting"."value", '0')::bigint + ${usage[field]})::text, "updatedAt" = NOW()`),
      );
    },

    async acquireLock(key, ttlMs) {
      const now = new Date();
      await prisma.pipelineLock.upsert({ where: { key }, create: { key, lockedUntil: null }, update: {} });
      const result = await prisma.pipelineLock.updateMany({
        where: { key, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        data: { lockedUntil: new Date(now.getTime() + ttlMs) },
      });
      return result.count === 1;
    },

    async releaseLock(key) {
      await prisma.pipelineLock.updateMany({ where: { key }, data: { lockedUntil: null } });
    },
  };
  return store;
}

/** Cumulative AI usage recorded by `recordAiUsage`, for the admin dashboard. Zero for a counter never written. */
export async function getAiUsageTotals(): Promise<{ calls: number; inputTokens: number; outputTokens: number }> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(USAGE_KEYS) } }, select: { key: true, value: true } });
  const byKey = new Map(rows.map((r) => [r.key, Number.parseInt(r.value, 10) || 0]));
  return { calls: byKey.get(USAGE_KEYS.calls) ?? 0, inputTokens: byKey.get(USAGE_KEYS.inputTokens) ?? 0, outputTokens: byKey.get(USAGE_KEYS.outputTokens) ?? 0 };
}
