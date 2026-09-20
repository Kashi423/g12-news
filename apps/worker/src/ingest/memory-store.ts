import type { CreateResult, IngestStore, LogEntry, NewArticle, SourceRecord } from "./store";

/** In-memory IngestStore for tests: same uniqueness rules as the database, plus inspectable state. */
export class MemoryStore implements IngestStore {
  readonly articles: (NewArticle & { id: string })[] = [];
  readonly logs: LogEntry[] = [];
  readonly touched = new Map<string, { lastFetchedAt: Date; lastError: string | null }>();

  constructor(public sources: SourceRecord[] = []) {}

  async listActiveSources(): Promise<SourceRecord[]> {
    return this.sources.map((s) => ({ ...s, lastFetchedAt: this.touched.get(s.id)?.lastFetchedAt ?? s.lastFetchedAt }));
  }

  async findExistingUrls(urls: string[]): Promise<Set<string>> {
    const known = new Set(this.articles.map((a) => a.sourceUrl));
    return new Set(urls.filter((u) => known.has(u)));
  }

  async recentPublished(limit: number): Promise<{ id: string; title: string }[]> {
    return this.articles
      .filter((a) => a.status === "PUBLISHED")
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
}
