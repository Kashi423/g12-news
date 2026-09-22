import type { AttachSourceResult, CreateResult, IngestStore, LogEntry, NewArticle, SourceRecord, SourceSnippet } from "./store";

export interface StoredArticle extends NewArticle {
  id: string;
  clusterId?: string;
  qualityScore?: number;
  verification?: unknown;
  developing?: boolean;
  contentUpdatedAt?: Date;
}

interface Cluster {
  id: string;
  category: string;
  sources: (SourceSnippet & { addedAt: Date })[];
}

/** In-memory IngestStore for tests: same uniqueness rules as the database, plus inspectable state. */
export class MemoryStore implements IngestStore {
  readonly articles: StoredArticle[] = [];
  readonly logs: LogEntry[] = [];
  readonly touched = new Map<string, { lastFetchedAt: Date; lastError: string | null }>();
  /** The "Require review before publish" switch; tests flip it, also while a run is in progress. */
  reviewRequired = false;
  /** How many times the switch was read (once per accepted story). */
  reviewReads = 0;
  readonly clusters = new Map<string, Cluster>();
  readonly clusterUrls = new Set<string>();
  aiUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  private readonly locks = new Map<string, number>();
  private nextClusterId = 1;

  constructor(public sources: SourceRecord[] = []) {}

  async requireReview(): Promise<boolean> {
    this.reviewReads++;
    return this.reviewRequired;
  }

  async listActiveSources(): Promise<SourceRecord[]> {
    return this.sources.map((s) => ({ ...s, lastFetchedAt: this.touched.get(s.id)?.lastFetchedAt ?? s.lastFetchedAt }));
  }

  async findExistingUrls(urls: string[]): Promise<Set<string>> {
    const known = new Set(this.articles.map((a) => a.sourceUrl));
    return new Set(urls.filter((u) => known.has(u)));
  }

  async recentPublished(limit: number): Promise<{ id: string; title: string }[]> {
    return this.articles
      .filter((a) => a.status === "PUBLISHED" || a.status === "PENDING_REVIEW")
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit)
      .map((a) => ({ id: a.id, title: a.title }));
  }

  async slugExists(slug: string): Promise<boolean> {
    return this.articles.some((a) => a.slug === slug);
  }

  async createArticle(article: NewArticle): Promise<CreateResult> {
    if (this.articles.some((a) => a.slug === article.slug)) return { ok: false, conflict: "slug" };
    if (this.articles.some((a) => a.sourceUrl === article.sourceUrl)) return { ok: false, conflict: "url" };
    const id = `a${this.articles.length + 1}`;
    this.articles.push({ ...article, id });
    return { ok: true, id };
  }

  async touchSource(id: string, update: { lastFetchedAt: Date; lastError: string | null }): Promise<void> {
    this.touched.set(id, update);
  }

  async writeLog(entry: LogEntry): Promise<void> {
    this.logs.push(entry);
  }

  async attachSource(articleId: string, category: string, snippet: SourceSnippet): Promise<AttachSourceResult> {
    const article = this.articles.find((a) => a.id === articleId);
    let clusterId = article?.clusterId;
    if (!clusterId) {
      clusterId = `c${this.nextClusterId++}`;
      this.clusters.set(clusterId, { id: clusterId, category, sources: [] });
      if (article) article.clusterId = clusterId;
    }
    const cluster = this.clusters.get(clusterId)!;
    const added = !this.clusterUrls.has(snippet.url);
    if (added) {
      this.clusterUrls.add(snippet.url);
      cluster.sources.push({ ...snippet, addedAt: new Date() });
    }
    const sources = [...cluster.sources].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    return { clusterId, added, sources, articleBody: article?.body ?? "" };
  }

  async updateVerification(articleId: string, update: { qualityScore: number; verification: unknown; developing: boolean; touchedContent: boolean }): Promise<void> {
    const article = this.articles.find((a) => a.id === articleId);
    if (!article) return;
    article.qualityScore = update.qualityScore;
    article.verification = update.verification;
    article.developing = update.developing;
    if (update.touchedContent) article.contentUpdatedAt = new Date();
  }

  async recordAiUsage(usage: { calls: number; inputTokens: number; outputTokens: number }): Promise<void> {
    this.aiUsage.calls += usage.calls;
    this.aiUsage.inputTokens += usage.inputTokens;
    this.aiUsage.outputTokens += usage.outputTokens;
  }

  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const heldUntil = this.locks.get(key);
    if (heldUntil && heldUntil > now) return false;
    this.locks.set(key, now + ttlMs);
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    this.locks.delete(key);
  }
}
