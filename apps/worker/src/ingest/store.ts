import type { CategoryId } from "@g12/config";

/**
 * Everything the pipeline needs from the database. The real implementation is prisma-store.ts;
 * tests use memory-store.ts, so the pipeline logic runs without a database.
 */
export interface SourceRecord {
  id: string;
  name: string;
  rssUrl: string;
  category: CategoryId;
  lastFetchedAt: Date | null;
}

export interface NewArticle {
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  imageUrl: string | null;
  /** Who the feed credited for imageUrl; absent or null when it named nobody. */
  imageCredit?: string | null;
  category: CategoryId;
  tags: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: Date;
  isBreaking: boolean;
  urgencyScore: number;
  /** PENDING_REVIEW: accepted, but held back because "Require review before publish" was on when it was saved. */
  status: "PUBLISHED" | "PENDING_REVIEW" | "REJECTED";
}

export type CreateResult = { ok: true; id: string } | { ok: false; conflict: "slug" | "url" };

export interface LogEntry {
  sourceId: string;
  itemsFound: number;
  itemsPublished: number;
  itemsSkipped: number;
  error: string | null;
}

export interface IngestStore {
  listActiveSources(): Promise<SourceRecord[]>;
  /** Which of these canonical URLs already have an Article row (any status). */
  findExistingUrls(urls: string[]): Promise<Set<string>>;
  /**
   * Titles of the most recent stories that are live or waiting for review, newest first. Waiting ones
   * count: otherwise, with review on, two outlets' copies of one story would both be queued.
   */
  recentPublished(limit: number): Promise<{ id: string; title: string }[]>;
  slugExists(slug: string): Promise<boolean>;
  createArticle(article: NewArticle): Promise<CreateResult>;
  /**
   * Whether "Require review before publish" is on RIGHT NOW. Read for every story just before it is
   * saved (never cached), so flipping the switch applies to the very next story without a restart.
   */
  requireReview(): Promise<boolean>;
  /** Record a fetch attempt. `lastSuccessAt` moves only when the attempt worked (lastError is null). */
  touchSource(id: string, update: { lastFetchedAt: Date; lastError: string | null }): Promise<void>;
  writeLog(entry: LogEntry): Promise<void>;
}
