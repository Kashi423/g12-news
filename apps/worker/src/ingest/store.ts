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
  category: CategoryId;
  tags: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: Date;
  isBreaking: boolean;
  urgencyScore: number;
  status: "PUBLISHED" | "REJECTED";
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
  /** Titles of the most recent PUBLISHED articles, newest first. */
  recentPublished(limit: number): Promise<{ id: string; title: string }[]>;
  slugExists(slug: string): Promise<boolean>;
  createArticle(article: NewArticle): Promise<CreateResult>;
  touchSource(id: string, update: { lastFetchedAt: Date; lastError: string | null }): Promise<void>;
  writeLog(entry: LogEntry): Promise<void>;
}
