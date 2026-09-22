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
  /** Editorial trust, 1 (least) to 5 (most); one input to a story's quality score. Defaults to 3 (the middle) when absent, e.g. in older tests. */
  reliability?: number;
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

/** One RSS report offered to a cluster: the lead report of a fresh story, or a corroborating one found later. */
export interface SourceSnippet {
  sourceId: string;
  sourceName: string;
  url: string;
  guid: string | null;
  title: string;
  description: string;
  publishedAt: Date;
  /** The reporting source's editorial trust, 1-5 (Source.reliability at the time it was attached). */
  reliability: number;
}

/**
 * What changed after `attachSource` ran, so the pipeline can decide whether to log it / bump
 * anything downstream. `sources` is every report the cluster now holds (lead + corroborating),
 * newest first, for cross-source verification and public attribution. `articleBody` is the article's
 * current text, for re-validating its claims against the (possibly just-grown) source list.
 */
export interface AttachSourceResult {
  clusterId: string;
  /** False when this exact URL was already attached (idempotent replay, e.g. a retried run). */
  added: boolean;
  sources: SourceSnippet[];
  articleBody: string;
}

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

  /**
   * Offers one RSS report to the given article's story cluster: creates the cluster (tagged with
   * `category`) the first time an article is offered a source, then adds `snippet` to it (a no-op if
   * that exact URL is already attached). Called once for every accepted story's own lead report, and
   * again whenever a later report is judged the same story (see pipeline.ts's duplicate-detection
   * path). Returns every source the cluster now holds, for cross-source verification.
   */
  attachSource(articleId: string, category: CategoryId, snippet: SourceSnippet): Promise<AttachSourceResult>;
  /** Writes back what attaching a source implied for the article: its internal quality signal. */
  updateVerification(articleId: string, update: { qualityScore: number; verification: unknown; developing: boolean; touchedContent: boolean }): Promise<void>;

  /** Adds to the pipeline's persistent AI-usage counters (survives process restarts; read by /admin). */
  recordAiUsage(usage: { calls: number; inputTokens: number; outputTokens: number }): Promise<void>;

  /**
   * Named mutex so at most one ingestion pass runs at a time (a scheduled tick and a manual
   * `ingest:once`, or two worker processes, must not double-process the same feeds). `acquire` is
   * one atomic conditional write; only the caller whose write actually matched a row holds the lock.
   */
  acquireLock(key: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string): Promise<void>;
}
