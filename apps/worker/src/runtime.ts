import { fetchFeed } from "./ingest/feed";
import type { RunDeps } from "./ingest/pipeline";
import { analyzeArticle } from "./lib/ai";
import { aiConfigProblems } from "./lib/provider";
import { loadSettings } from "./settings";

/** Missing or invalid environment settings. The AI key is only needed when the AI will be called. */
export function missingEnv({ needsAi }: { needsAi: boolean }): string[] {
  const problems: string[] = [];
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL");
  if (needsAi) problems.push(...aiConfigProblems());
  return problems;
}

/**
 * Wire the real database, feed fetcher and Claude analyzer into the pipeline.
 * Imported lazily: the database client refuses to load without DATABASE_URL.
 */
export async function createRunDeps(log: (line: string) => void): Promise<RunDeps> {
  const { createPrismaStore } = await import("./ingest/prisma-store");
  const { usage } = await import("./lib/ai");
  const settings = loadSettings();
  const store = createPrismaStore();
  return {
    store,
    fetchFeed: (url) => fetchFeed(url, settings),
    // Persists each call's share of the in-process usage counter, so /admin can show cumulative AI
    // usage across restarts. `analyzeArticle` itself stays store-agnostic (see lib/ai.ts).
    analyze: async (input) => {
      const before = { ...usage };
      try {
        return await analyzeArticle(input);
      } finally {
        const delta = { calls: usage.calls - before.calls, inputTokens: usage.inputTokens - before.inputTokens, outputTokens: usage.outputTokens - before.outputTokens };
        if (delta.calls > 0) await store.recordAiUsage(delta).catch(() => undefined);
      }
    },
    settings,
    log,
  };
}

export async function disconnectDatabase(): Promise<void> {
  const { prisma } = await import("@g12/db");
  await prisma.$disconnect();
}
