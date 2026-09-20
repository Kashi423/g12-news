import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadSettings, type IngestSettings } from "../settings";
import type { FeedItem } from "./feed";
import { MemoryStore } from "./memory-store";
import { runIngestion, type RunOptions } from "./pipeline";
import type { SourceRecord } from "./store";
import { AiUnavailableError, type AnalyzeInput, type AnalysisOutcome, type Analyzer } from "./types";
import { slugify } from "./url";

const NOW = new Date("2026-09-20T10:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const settings = { ...loadSettings({}), aiConcurrency: 2 };

const DAWN = "https://www.dawn.com/feeds/pakistan";
const GEO = "https://www.geo.tv/rss/1/1";
const BBC = "https://feeds.bbci.co.uk/news/world/rss.xml";
const ARY = { url: "https://arynews.tv/feed/" };

const source = (id: string, name: string, rssUrl: string, category: SourceRecord["category"] = "PAKISTAN", lastFetchedAt: Date | null = null): SourceRecord => ({
  id,
  name,
  rssUrl,
  category,
  lastFetchedAt,
});
const dawn = () => source("s-dawn", "Dawn — Pakistan", DAWN);
const geo = () => source("s-geo", "Geo News — Pakistan", GEO);

const item = (title: string, url: string, minutesAgo = 10, snippet = "A short description of the story."): FeedItem => ({
  title,
  url,
  snippet,
  publishedAt: ago(minutesAgo),
  imageUrl: null,
});

const publish = (input: AnalyzeInput, over: Partial<Extract<AnalysisOutcome, { kind: "publish" }>> = {}): AnalysisOutcome => ({
  kind: "publish",
  headline: `Brief: ${input.title}`,
  excerpt: "Teaser.",
  summary: "An original summary.",
  category: input.feedCategory,
  tags: ["a", "b", "c"],
  slug: slugify(`brief ${input.title}`),
  urgencyScore: 3,
  ...over,
});

function harness(
  sources: SourceRecord[],
  feeds: Record<string, FeedItem[] | Error>,
  analyze: Analyzer = async (i) => publish(i),
  overrides: Partial<IngestSettings> = {},
) {
  const store = new MemoryStore(sources);
  const calls: AnalyzeInput[] = [];
  const fetched: string[] = [];
  const run = (options: RunOptions = {}) =>
    runIngestion(
      {
        store,
        settings: { ...settings, ...overrides },
        now: () => NOW,
        fetchFeed: async (url) => {
          fetched.push(url);
          const feed = feeds[url];
          if (feed instanceof Error) throw feed;
          if (!feed) throw new Error("HTTP 404");
          return feed;
        },
        analyze: async (input) => {
          calls.push(input);
          return analyze(input);
        },
      },
      options,
    );
  return { store, calls, fetched, run };
}

describe("runIngestion", () => {
  it("publishes new items with attribution, breaking flag and one log row per source", async () => {
    const { store, run, calls } = harness([dawn(), geo()], {
      [DAWN]: [item("Council approves new budget", "https://www.dawn.com/news/1?utm_source=rss"), item("Blast kills three near market", "https://www.dawn.com/news/2", 5)],
      [GEO]: [item("Rain forecast for Punjab this week", "https://www.geo.tv/latest/3")],
    }, async (input) => publish(input, { urgencyScore: /blast/i.test(input.title) ? 8 : 3 }));

    const report = await run();

    assert.equal(calls.length, 3);
    assert.equal(store.articles.length, 3);
    const byUrl = new Map(store.articles.map((a) => [a.sourceUrl, a]));
    const budget = byUrl.get("https://www.dawn.com/news/1")!; // tracking parameter stripped
    assert.equal(budget.status, "PUBLISHED");
    assert.equal(budget.sourceName, "Dawn", "attribution uses the outlet, not the feed label");
    assert.equal(budget.title, "Brief: Council approves new budget");
    assert.equal(budget.body, "An original summary.");
    assert.equal(budget.isBreaking, false);
    const blast = byUrl.get("https://www.dawn.com/news/2")!;
    assert.equal(blast.urgencyScore, 9, "8 from the model + 1 for a fresh story with an urgent keyword");
    assert.equal(blast.isBreaking, true);
    assert.equal(byUrl.get("https://www.geo.tv/latest/3")!.sourceName, "Geo News");

    assert.equal(store.logs.length, 2);
    assert.deepEqual(store.logs.find((l) => l.sourceId === "s-dawn"), { sourceId: "s-dawn", itemsFound: 2, itemsPublished: 2, itemsSkipped: 0, error: null });
    assert.equal(store.touched.get("s-dawn")?.lastError, null);
    assert.equal(report.sources.reduce((n, s) => n + s.published, 0), 3);
  });

  it("skips URLs already stored (ignoring tracking params) and URLs repeated across feeds", async () => {
    const { store, run, calls } = harness([dawn(), geo()], {
      [DAWN]: [item("Already stored story", "https://www.dawn.com/news/9?utm_medium=x"), item("Shared story", "https://example.com/shared")],
      [GEO]: [item("Shared story again", "https://example.com/shared?fbclid=abc")],
    });
    await store.createArticle({ slug: "old", title: "Old", excerpt: "", body: "b", imageUrl: null, category: "PAKISTAN", tags: [], sourceId: "s-dawn", sourceName: "Dawn", sourceUrl: "https://www.dawn.com/news/9", publishedAt: ago(90), isBreaking: false, urgencyScore: 0, status: "PUBLISHED" });

    const report = await run();

    assert.equal(calls.length, 1, "only the shared story is new, and only once");
    assert.equal(store.articles.filter((a) => a.status === "PUBLISHED").length, 2);
    assert.equal(report.sources.find((s) => s.sourceId === "s-dawn")!.alreadyIngested, 1);
    assert.equal(report.sources.find((s) => s.sourceId === "s-geo")!.alreadyIngested, 1);
    assert.equal(store.logs.find((l) => l.sourceId === "s-geo")!.itemsSkipped, 1);
  });

  it("drops a near-identical headline from a second outlet without spending an AI call", async () => {
    const { store, run, calls } = harness([dawn(), geo()], {
      [DAWN]: [item("Shehbaz Sharif meets Saudi crown prince in Riyadh", "https://www.dawn.com/news/10", 30)],
      [GEO]: [item("PM Shehbaz Sharif meets Saudi crown prince in Riyadh", "https://www.geo.tv/latest/10", 12)],
    });

    const report = await run();

    assert.equal(calls.length, 1);
    assert.deepEqual(store.articles.map((a) => [a.sourceName, a.status]), [["Dawn", "PUBLISHED"], ["Geo News", "REJECTED"]]);
    assert.match(store.articles[1]!.excerpt, /duplicate/i);
    assert.equal(report.sources.find((s) => s.sourceId === "s-geo")!.duplicates, 1);
    assert.equal(store.logs.find((l) => l.sourceId === "s-geo")!.itemsPublished, 0);
  });

  it("asks the AI about a same-run headline that is similar but reworded, and drops it when the AI agrees", async () => {
    const { store, run, calls } = harness([dawn(), geo()], {
      [DAWN]: [item("PM Shehbaz Sharif meets Saudi crown prince in Riyadh", "https://www.dawn.com/news/11", 30)],
      [GEO]: [item("Shehbaz Sharif meets Saudi crown prince, Riyadh visit", "https://www.geo.tv/latest/11", 12)],
    }, async (input) => (input.similar.length ? { kind: "duplicate", ofId: input.similar[0]!.id } : publish(input)));

    await run();

    assert.equal(calls.length, 2, "the reworded report is judged by the AI, after the first one is published");
    assert.deepEqual(calls[1]!.similar, [{ id: 1, title: "Brief: PM Shehbaz Sharif meets Saudi crown prince in Riyadh" }], "the earlier article is shown once");
    assert.deepEqual(store.articles.map((a) => a.status), ["PUBLISHED", "REJECTED"]);
  });

  it("does not auto-drop distinct stories that share a headline template", async () => {
    const { store, run, calls } = harness([dawn(), geo()], {
      [DAWN]: [item("Pakistan beat India by 5 wickets in Asia Cup", "https://www.dawn.com/news/12", 30)],
      [GEO]: [item("Pakistan beat Bangladesh by 5 wickets in Asia Cup", "https://www.geo.tv/latest/12", 12)],
    });
    await run();
    assert.equal(calls.length, 2);
    assert.deepEqual(store.articles.map((a) => a.status), ["PUBLISHED", "PUBLISHED"]);
  });

  it("lets the AI judge a headline that is only partly similar to a recent article", async () => {
    const { store, run, calls } = harness([geo()], { [GEO]: [item("PM Shehbaz arrives in Riyadh for talks with Saudi crown prince", "https://www.geo.tv/latest/20")] }, async (input) =>
      input.similar.length ? { kind: "duplicate", ofId: input.similar[0]!.id } : publish(input),
    );
    await store.createArticle({ slug: "earlier", title: "Saudi crown prince hosts Pakistan prime minister in Riyadh", excerpt: "", body: "b", imageUrl: null, category: "WORLD", tags: [], sourceId: "s-x", sourceName: "Dawn", sourceUrl: "https://www.dawn.com/news/19", publishedAt: ago(40), isBreaking: false, urgencyScore: 0, status: "PUBLISHED" });

    const report = await run();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.similar, [{ id: 1, title: "Saudi crown prince hosts Pakistan prime minister in Riyadh" }]);
    assert.equal(store.articles.at(-1)!.status, "REJECTED");
    assert.equal(report.sources[0]!.duplicates, 1);
  });

  it("stores AI rejections as REJECTED so they are never sent to the AI again", async () => {
    const { store, run, calls } = harness([dawn()], { [DAWN]: [item("Sponsored: win a free phone", "https://www.dawn.com/news/30")] }, async () => ({ kind: "reject", reason: "advertisement" }));

    const first = await run();
    assert.equal(calls.length, 1);
    assert.equal(store.articles[0]!.status, "REJECTED");
    assert.equal(store.articles[0]!.body, "");
    assert.match(store.articles[0]!.excerpt, /advertisement/);
    assert.equal(first.sources[0]!.rejected, 1);
    assert.equal(store.logs[0]!.itemsPublished, 0);

    await run({ force: true });
    assert.equal(calls.length, 1, "already stored as rejected, so the AI is not asked again");
  });

  it("records an AI failure without storing anything, and retries the item next run", async () => {
    let fail = true;
    const { store, run, calls } = harness([dawn()], { [DAWN]: [item("Story that hits an API error", "https://www.dawn.com/news/40")] }, async (input) => {
      if (fail) throw new Error("529 overloaded");
      return publish(input);
    });

    const first = await run();
    assert.equal(store.articles.length, 0);
    assert.equal(first.sources[0]!.aiErrors, 1);
    assert.match(store.logs[0]!.error ?? "", /1 item\(s\) failed AI analysis: 529 overloaded/);

    fail = false;
    await run({ force: true });
    assert.equal(calls.length, 2);
    assert.equal(store.articles[0]!.status, "PUBLISHED");
  });

  it("logs a feed failure for that source and carries on with the others", async () => {
    const { store, run } = harness([dawn(), geo()], { [DAWN]: new Error("HTTP 503"), [GEO]: [item("Geo story", "https://www.geo.tv/latest/50")] });

    const report = await run();

    assert.equal(store.articles.length, 1);
    assert.deepEqual(store.logs.find((l) => l.sourceId === "s-dawn"), { sourceId: "s-dawn", itemsFound: 0, itemsPublished: 0, itemsSkipped: 0, error: "HTTP 503" });
    assert.equal(store.touched.get("s-dawn")?.lastError, "HTTP 503");
    assert.equal(report.sources.find((s) => s.sourceId === "s-dawn")!.error, "HTTP 503");
  });

  it("does not fetch a feed more often than every 10 minutes unless forced", async () => {
    const recent = source("s-dawn", "Dawn — Pakistan", DAWN, "PAKISTAN", ago(4));
    const stale = source("s-geo", "Geo News — Pakistan", GEO, "PAKISTAN", ago(11));
    const { store, run, fetched } = harness([recent, stale], { [DAWN]: [item("Dawn story", "https://www.dawn.com/news/60")], [GEO]: [item("Geo story", "https://www.geo.tv/latest/60")] });

    const report = await run();
    assert.deepEqual(fetched, [GEO]);
    assert.equal(report.sources.find((s) => s.sourceId === "s-dawn")!.notDue, true);
    assert.deepEqual(store.logs.map((l) => l.sourceId), ["s-geo"], "no log row for a source that was not fetched");

    fetched.length = 0;
    await run({ force: true });
    assert.deepEqual(fetched.sort(), [DAWN, GEO].sort());
  });

  it("ignores items past the age limit and caps new items per source, newest first", async () => {
    const headlines = [
      "Senate passes water conservation bill",
      "Karachi port handles record container volume",
      "Quetta hospital opens new cardiac unit",
      "Punjab launches free wheat seed scheme",
      "Peshawar university announces scholarship fund",
      "Lahore metro adds night services",
      "Gwadar airport receives first cargo flight",
      "Sindh cabinet approves flood relief package",
      "Islamabad court hears telecom licence case",
      "Multan farmers protest cotton prices",
      "Rawalpindi bypass project reaches halfway mark",
      "Hyderabad textile exports climb this quarter",
    ];
    const items = headlines.map((title, i) => item(title, `https://www.dawn.com/news/7${i}`, i + 1));
    items.push(item("Ancient story from two days ago", "https://www.dawn.com/news/old", 48 * 60));
    const { store, run, calls } = harness([dawn()], { [DAWN]: items });

    const report = await run({ maxItemsPerSource: 5 });
    const r = report.sources[0]!;

    assert.equal(r.found, 13);
    assert.equal(r.tooOld, 1);
    assert.equal(r.deferred, 7);
    assert.equal(r.published, 5);
    assert.equal(calls.length, 5);
    assert.deepEqual(new Set(calls.map((c) => c.title)), new Set(items.slice(0, 5).map((i) => i.title)), "the 5 newest were processed");
    assert.equal(store.logs[0]!.itemsSkipped, 8);
  });

  it("dry run fetches and screens but calls no AI and writes nothing", async () => {
    const { store, run, calls } = harness([dawn()], { [DAWN]: [item("Some new story", "https://www.dawn.com/news/80")] });
    const report = await run({ dryRun: true });
    assert.equal(calls.length, 0);
    assert.equal(store.articles.length, 0);
    assert.equal(store.logs.length, 0);
    assert.equal(store.touched.size, 0);
    assert.equal(report.dryRun, true);
    assert.equal(report.sources[0]!.planned, 1);
  });

  it("still analyzes a duplicate-looking item when the earlier report was rejected", async () => {
    const { store, run, calls } = harness([dawn(), geo()], {
      [DAWN]: [item("Government announces new petrol prices for October", "https://www.dawn.com/news/90", 30)],
      [GEO]: [item("New petrol prices for October announced by government", "https://www.geo.tv/latest/90", 10)],
    }, async (input) => (input.sourceName === "Dawn" ? { kind: "reject", reason: "press_release" } : publish(input)));

    await run();

    assert.equal(calls.length, 2, "the follower is analyzed once the leader turns out not to be published");
    assert.deepEqual(store.articles.map((a) => [a.sourceName, a.status]), [["Dawn", "REJECTED"], ["Geo News", "PUBLISHED"]]);
  });

  it("tells the AI which feeds are international", async () => {
    const world = source("s-bbc", "BBC News — World", BBC, "WORLD");
    const { run, calls } = harness([dawn(), world], { [DAWN]: [item("Local story", "https://www.dawn.com/news/100")], [BBC]: [item("Overseas story", "https://www.bbc.com/news/100")] });
    await run();
    assert.equal(calls.find((c) => c.sourceName === "Dawn")!.internationalFeed, false);
    assert.equal(calls.find((c) => c.sourceName === "BBC News")!.internationalFeed, true);
  });

  it("gives colliding slugs a unique suffix", async () => {
    const { store, run } = harness([dawn()], { [DAWN]: [item("First distinct alpha story", "https://www.dawn.com/news/110", 20), item("Second unrelated beta tale", "https://www.dawn.com/news/111", 10)] }, async (input) =>
      publish(input, { slug: "same-slug" }),
    );
    await run();
    const slugs = store.articles.map((a) => a.slug);
    assert.equal(new Set(slugs).size, 2);
    assert.ok(slugs.includes("same-slug"));
    assert.ok(slugs.some((s) => /^same-slug-[a-z0-9]+$/.test(s)));
  });

  it("never flags an old story as breaking, whatever the model says", async () => {
    const { store, run } = harness([dawn()], { [DAWN]: [item("Explosion reported at factory", "https://www.dawn.com/news/120", 8 * 60)] }, async (input) => publish(input, { urgencyScore: 10 }));
    await run();
    assert.equal(store.articles[0]!.urgencyScore, 5);
    assert.equal(store.articles[0]!.isBreaking, false);
  });

  it("stops calling the AI when it becomes unavailable, defers the rest, and records why", async () => {
    const topics = ["senate water bill", "port container record", "cardiac unit opens", "wheat seed scheme", "scholarship fund launched", "night metro services"];
    const items = topics.map((t, i) => item(`Report on ${t} number${i}`, `https://www.dawn.com/news/20${i}`, 30 - i * 3));
    let calls = 0;
    const { store, run } = harness([dawn()], { [DAWN]: items }, async (input) => {
      calls++;
      if (calls === 2) throw new AiUnavailableError("Groq free-tier budget is used up on every model");
      return publish(input);
    }, { aiConcurrency: 1 });

    const report = await run();

    assert.equal(calls, 2, "no AI calls after the outage was detected");
    assert.equal(store.articles.length, 1, "only the item processed before the outage was saved");
    assert.equal(report.aiUnavailable, "Groq free-tier budget is used up on every model");
    assert.equal(report.sources[0]!.deferredByAi, 5);
    assert.equal(report.sources[0]!.aiErrors, 0, "an outage is not counted as an item error");
    assert.match(store.logs[0]!.error ?? "", /AI unavailable, 5 item\(s\) deferred to the next run: Groq free-tier budget/);
    assert.equal(store.logs[0]!.itemsPublished, 1);
  });

  it("spreads a per-run cap round-robin across sources instead of letting one outlet take it all", async () => {
    const ary = source("s-ary", "ARY News", "https://arynews.tv/feed/");
    const make = (prefix: string, base: string, freshest: number) =>
      ["harvest", "railway", "textile", "hospital"].map((topic, i) => item(`${prefix} ${topic} report`, `${base}/${i}`, freshest + i * 5));
    const { calls, run, store } = harness([dawn(), geo(), ary], {
      [DAWN]: make("Dawn", "https://www.dawn.com/news/3", 1),
      [GEO]: make("Geo", "https://www.geo.tv/latest/3", 2),
      [ARY.url]: make("ARY", "https://arynews.tv/3", 3),
    });

    const report = await run({ maxItemsPerRun: 5 });

    const perOutlet = (name: string) => calls.filter((c) => c.sourceName === name).length;
    assert.deepEqual([perOutlet("Dawn"), perOutlet("Geo News"), perOutlet("ARY News")], [2, 2, 1], "freshest sources go first, one item each per round");
    assert.equal(calls.length, 5);
    assert.equal(store.articles.length, 5);
    assert.deepEqual(report.sources.map((s) => s.deferred), [2, 2, 3]);
  });

  it("treats a missing or future date as now", async () => {
    const undated: FeedItem = { title: "Undated story", url: "https://www.dawn.com/news/130", snippet: "x", publishedAt: null, imageUrl: null };
    const future: FeedItem = { title: "Future dated tale", url: "https://www.dawn.com/news/131", snippet: "x", publishedAt: new Date(NOW.getTime() + 6 * 3_600_000), imageUrl: null };
    const { store, run } = harness([dawn()], { [DAWN]: [undated, future] });
    await run();
    assert.deepEqual(store.articles.map((a) => a.publishedAt.toISOString()), [NOW.toISOString(), NOW.toISOString()]);
  });
});
