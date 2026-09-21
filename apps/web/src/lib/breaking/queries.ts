import { breakingCutoff, type CategoryId } from "@g12/config";
import { MAX_ITEMS } from "./state";
import type { BreakingItem } from "./types";

/**
 * Database reads for the breaking-news feature. They never throw: if the database is down or not
 * configured they return null (and log once a minute), so a database problem cannot take pages
 * down with it. Callers decide what null means: the layout shows nothing, /api/breaking answers 503.
 */

const SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  category: true,
  sourceName: true,
  publishedAt: true,
  urgencyScore: true,
} as const;

interface Row {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  sourceName: string;
  publishedAt: Date;
  urgencyScore: number;
}

function toItem(row: Row): BreakingItem {
  return { ...row, category: row.category as CategoryId, publishedAt: row.publishedAt.toISOString() };
}

let lastWarning = 0;
function warn(error: unknown): void {
  if (Date.now() - lastWarning < 60_000) return;
  lastWarning = Date.now();
  // Some driver errors have an empty message; fall back to the underlying cause or the error's name.
  const reason =
    error instanceof Error ? error.message || (error.cause instanceof Error ? error.cause.message : "") || error.name : String(error);
  console.warn(`[breaking] database unavailable: ${reason}`);
}

// Loaded lazily: the shared client throws at import time when DATABASE_URL is missing.
async function database() {
  return (await import("@g12/db")).prisma;
}

// A few seconds of caching so a burst of page views or polls costs one query, not hundreds.
const CACHE_MS = 5_000;
let cache: { at: number; items: BreakingItem[] } | null = null;

export function invalidateBreakingCache(): void {
  cache = null;
}

/** Current breaking stories, newest first: flagged breaking, published, and within the 6 hour window. */
export async function getBreakingItems(limit = MAX_ITEMS, now = Date.now()): Promise<BreakingItem[] | null> {
  if (cache && now - cache.at < CACHE_MS) return cache.items.slice(0, limit);
  try {
    const prisma = await database();
    const rows = await prisma.article.findMany({
      where: { status: "PUBLISHED", isBreaking: true, publishedAt: { gte: breakingCutoff(now) } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: MAX_ITEMS,
      select: SELECT,
    });
    cache = { at: now, items: rows.map(toItem) };
    return cache.items.slice(0, limit);
  } catch (error) {
    warn(error);
    return null;
  }
}

/**
 * What the layout hands to the client on first render: the current stories (empty if the database is
 * unavailable, so the site still renders) and the server's clock, so relative times match on hydration.
 */
export async function getInitialBreaking(): Promise<{ items: BreakingItem[]; serverNow: number }> {
  const serverNow = Date.now();
  return { items: (await getBreakingItems(MAX_ITEMS, serverNow)) ?? [], serverNow };
}

/** One story, only if it is currently a breaking story. */
export async function getBreakingItem(id: string, now = Date.now()): Promise<BreakingItem | null> {
  try {
    const prisma = await database();
    const row = await prisma.article.findFirst({
      where: { id, status: "PUBLISHED", isBreaking: true, publishedAt: { gte: breakingCutoff(now) } },
      select: SELECT,
    });
    return row ? toItem(row) : null;
  } catch (error) {
    warn(error);
    return null;
  }
}
