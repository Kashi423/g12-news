import { SOURCES } from "@g12/config";
import type { IngestSettings } from "../settings";
import { describeError, type FeedItem } from "./feed";
import { createSerializer, mapPool } from "./pool";
import { TitleIndex } from "./similarity";
import type { IngestStore, NewArticle, SourceRecord } from "./store";
import { plain, truncate } from "./text";
import { AiUnavailableError, type AnalysisOutcome, type Analyzer, type RejectReason } from "./types";
import { canonicalizeUrl, slugify, uniqueSlug } from "./url";
import { finalUrgency } from "./urgency";

export interface RunOptions {
  /** Ignore the per-feed minimum interval (manual runs only). */
  force?: boolean;
  /** Fetch and screen, but call no AI and write nothing. */
  dryRun?: boolean;
  /** Override the per-source cap on new items per run. */
  maxItemsPerSource?: number;
  /** Override the per-run cap on new items across all sources (0 = no limit). */
  maxItemsPerRun?: number;
  /** Only sources whose name or URL contains this text. */
  sourceFilter?: string;
}

export interface RunDeps {
  store: IngestStore;
  fetchFeed: (url: string) => Promise<FeedItem[]>;
  analyze: Analyzer;
  settings: IngestSettings;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface SourceReport {
  sourceId: string;
  name: string;
  /** Not fetched this run because it was fetched less than the minimum interval ago. */
  notDue: boolean;
  /** Fetch/parse failure, if any. */
  error: string | null;
  found: number;
  published: number;
  /** Rejected by the AI (ad, press release, not relevant, ...); stored as REJECTED. */
  rejected: number;
  /** Same story as an earlier article; stored as REJECTED. */
  duplicates: number;
  /** URL already in the database, or repeated in another feed this run. */
  alreadyIngested: number;
  tooOld: number;
  /** Over the per-run cap; picked up on a later run. */
  deferred: number;
  invalid: number;
  aiErrors: number;
  firstAiError: string | null;
  /** Not analyzed because the AI became unavailable during the run (budget spent, bad key); retried next run. */
  deferredByAi: number;
  /** Dry run: items that would have been sent to the AI. */
  planned: number;
}

export interface RunReport {
  startedAt: Date;
  finishedAt: Date;
  dryRun: boolean;
  sources: SourceReport[];
  /** Why the AI stopped being used part-way through the run, if it did. */
  aiUnavailable: string | null;
}

interface Candidate {
  source: SourceRecord;
  report: SourceReport;
  outlet: string;
  title: string;
  url: string;
  description: string;
  publishedAt: Date;
  imageUrl: string | null;
}

const OUTLET_BY_URL = new Map(SOURCES.map((s) => [s.rssUrl, s.outlet]));

/** Attribution name for a source: the outlet ("Dawn"), not the feed label ("Dawn — Pakistan"). */
export function outletOf(source: Pick<SourceRecord, "name" | "rssUrl">): string {
  return OUTLET_BY_URL.get(source.rssUrl) ?? source.name.split(/\s+[—–-]\s+/)[0]!.trim();
}

const REASON_LABEL: Record<RejectReason, string> = {
  advertisement: "Rejected: advertisement",
  press_release: "Rejected: press release",
  low_quality: "Rejected: low quality",
  uncategorizable: "Rejected: could not be categorized confidently",
  not_relevant: "Rejected: not relevant to Pakistan and not a major world story",
  insufficient_content: "Rejected: not enough content to summarize",
  model_refusal: "Rejected: the AI declined to process this item",
  duplicate: "Rejected: duplicate of an earlier story",
};

function blankReport(source: SourceRecord): SourceReport {
  return {
    sourceId: source.id,
    name: source.name,
    notDue: false,
    error: null,
    found: 0,
    published: 0,
    rejected: 0,
    duplicates: 0,
    alreadyIngested: 0,
    tooOld: 0,
    deferred: 0,
    invalid: 0,
    aiErrors: 0,
    firstAiError: null,
    deferredByAi: 0,
    planned: 0,
  };
}

function clampPublished(date: Date | null, now: Date): Date {
  if (!date || date.getTime() > now.getTime() + 5 * 60_000) return now;
  return date;
}

/** One full pass: fetch every due feed, screen items, have the AI write briefs, save, log. */
export async function runIngestion(deps: RunDeps, options: RunOptions = {}): Promise<RunReport> {
  const { store, settings } = deps;
  const log = (line: string) => deps.log?.(plain(line));
  const clock = deps.now ?? (() => new Date());
  const startedAt = clock();
  const dryRun = options.dryRun === true;
  const cap = options.maxItemsPerSource ?? settings.maxItemsPerSource;
  const runCap = options.maxItemsPerRun ?? settings.maxItemsPerRun;
  let aiDown: string | null = null;

  const needle = options.sourceFilter?.toLowerCase();
  const sources = (await store.listActiveSources()).filter((s) => !needle || `${s.name} ${s.rssUrl}`.toLowerCase().includes(needle));
  const reports = sources.map(blankReport);
  const reportOf = new Map(sources.map((s, i) => [s.id, reports[i]!]));

  try {
    // 1. Fetch every due feed. A failing feed is recorded, never fatal.
    const fetched: { source: SourceRecord; report: SourceReport; items: FeedItem[] }[] = [];
    await mapPool(sources, settings.feedConcurrency, async (source) => {
      const report = reportOf.get(source.id)!;
      const attemptedAt = clock();
      if (!options.force && source.lastFetchedAt && attemptedAt.getTime() - source.lastFetchedAt.getTime() < settings.minFetchIntervalMs) {
        report.notDue = true;
        return;
      }
      try {
        const items = await deps.fetchFeed(source.rssUrl);
        report.found = items.length;
        fetched.push({ source, report, items });
        log(`  fetched  ${source.name}: ${items.length} items`);
      } catch (error) {
        report.error = describeError(error);
        log(`  FAILED   ${source.name}: ${report.error}`);
      }
      if (!dryRun) await store.touchSource(source.id, { lastFetchedAt: attemptedAt, lastError: report.error });
    });
    const dueCount = reports.filter((r) => !r.notDue).length;
    if (dueCount < reports.length) log(`  (${reports.length - dueCount} source(s) skipped: fetched less than ${settings.minFetchIntervalMs / 60_000} minutes ago)`);

    // 2. Turn feed items into candidates: valid, recent, not already stored, capped per source.
    const now = clock();
    const maxAgeMs = settings.maxItemAgeHours * 3_600_000;
    const seenUrls = new Set<string>();
    const staged: Candidate[][] = [];
    for (const { source, report, items } of fetched) {
      const outlet = outletOf(source);
      const list: Candidate[] = [];
      for (const item of items) {
        const url = canonicalizeUrl(item.url);
        if (!url || !item.title) {
          report.invalid++;
          continue;
        }
        if (seenUrls.has(url)) {
          report.alreadyIngested++;
          continue;
        }
        const publishedAt = clampPublished(item.publishedAt, now);
        if (now.getTime() - publishedAt.getTime() > maxAgeMs) {
          report.tooOld++;
          continue;
        }
        seenUrls.add(url);
        list.push({ source, report, outlet, title: item.title, url, description: item.snippet, publishedAt, imageUrl: item.imageUrl });
      }
      staged.push(list);
    }
    const existing = await store.findExistingUrls([...seenUrls]);
    const queues: Candidate[][] = [];
    for (const list of staged) {
      const fresh = list.filter((c) => {
        if (existing.has(c.url)) {
          c.report.alreadyIngested++;
          return false;
        }
        return true;
      });
      fresh.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      for (const c of fresh.slice(cap)) c.report.deferred++;
      if (fresh.length) queues.push(fresh.slice(0, cap));
    }

    // Per-run cap (free-tier budget): take items round-robin across sources, freshest source first,
    // so one busy outlet cannot use up the whole budget. Whatever is left over waits for the next run.
    let candidates: Candidate[] = [];
    if (runCap > 0) {
      queues.sort((a, b) => b[0]!.publishedAt.getTime() - a[0]!.publishedAt.getTime());
      const interleaved: Candidate[] = [];
      for (let round = 0; queues.some((q) => q.length > round); round++) {
        for (const q of queues) if (q[round]) interleaved.push(q[round]!);
      }
      candidates = interleaved.slice(0, runCap);
      for (const c of interleaved.slice(runCap)) c.report.deferred++;
    } else {
      candidates = queues.flat();
    }
    const heldBack = queues.reduce((n, q) => n + q.length, 0) - candidates.length;
    log(`  ${candidates.length} new item(s) to screen${heldBack > 0 ? ` (${heldBack} more held back by the per-run limit of ${runCap})` : ""}`);
    if (candidates.length === 0) return finish();

    // 3. Screen for duplicates, then have the AI process the rest in waves.
    const published = new TitleIndex<{ title: string }>();
    for (const article of await store.recentPublished(settings.recentWindow)) published.add(article.title, { title: article.title });

    const serial = createSerializer();
    let pending = candidates.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()); // earliest report first

    const saveRejected = async (c: Candidate, reason: RejectReason, detail?: string) => {
      const article: NewArticle = {
        slug: await uniqueSlug(slugify(c.title), c.url, (s) => store.slugExists(s)),
        title: truncate(c.title, 300),
        excerpt: truncate(detail ? `${REASON_LABEL[reason]} (${detail})` : REASON_LABEL[reason], 300),
        body: "",
        imageUrl: null,
        category: c.source.category,
        tags: [],
        sourceId: c.source.id,
        sourceName: c.outlet,
        sourceUrl: c.url,
        publishedAt: c.publishedAt,
        isBreaking: false,
        urgencyScore: 0,
        status: "REJECTED",
      };
      const result = await store.createArticle(article);
      if (!result.ok && result.conflict === "url") return void c.report.alreadyIngested++;
      if (reason === "duplicate") c.report.duplicates++;
      else c.report.rejected++;
    };

    const savePublished = async (c: Candidate, outcome: Extract<AnalysisOutcome, { kind: "publish" }>) => {
      const urgency = finalUrgency(outcome.urgencyScore, c.publishedAt, now, outcome.headline);
      const article: NewArticle = {
        slug: await uniqueSlug(outcome.slug, c.url, (s) => store.slugExists(s)),
        title: outcome.headline,
        excerpt: outcome.excerpt,
        body: outcome.summary,
        imageUrl: c.imageUrl,
        category: outcome.category,
        tags: outcome.tags,
        sourceId: c.source.id,
        sourceName: c.outlet,
        sourceUrl: c.url,
        publishedAt: c.publishedAt,
        isBreaking: urgency >= settings.breakingThreshold,
        urgencyScore: urgency,
        status: "PUBLISHED",
      };
      const result = await store.createArticle(article);
      if (!result.ok) {
        if (result.conflict === "url") return void c.report.alreadyIngested++;
        // Slug raced with another writer: retry once with a URL-derived suffix.
        const retry = await store.createArticle({ ...article, slug: await uniqueSlug(`${article.slug}-${Date.now().toString(36)}`, c.url, (s) => store.slugExists(s)) });
        if (!retry.ok) return void c.report.alreadyIngested++;
      }
      c.report.published++;
      // Later waves compare against both our headline and the original one other outlets may echo.
      published.add(article.title, { title: article.title });
      published.add(c.title, { title: article.title });
      log(`  + PUBLISHED  [${article.category}] urgency ${urgency}${article.isBreaking ? " BREAKING" : ""}  "${article.title}"  <- ${c.outlet}`);
    };

    let wave = 0;
    while (pending.length > 0) {
      wave++;
      const inWave = new TitleIndex<Candidate>();
      const leaders: { c: Candidate; similar: { id: number; title: string }[] }[] = [];
      const next: Candidate[] = [];

      for (const c of pending) {
        const strong = published.matches(c.title, settings.duplicateSimilarity, 1, settings.duplicateMinSharedTokens)[0];
        if (strong) {
          if (!dryRun) await saveRejected(c, "duplicate", `of "${truncate(strong.entry.ref.title, 60)}"`);
          else c.report.duplicates++;
          log(`  = DUPLICATE  "${truncate(c.title, 70)}"  ~ "${truncate(strong.entry.ref.title, 50)}"  <- ${c.outlet}`);
          continue;
        }
        // Similar to another item in this wave: decide after that one is done, so we compare against what was actually published.
        if (inWave.matches(c.title, settings.candidateSimilarity, 1).length > 0) {
          next.push(c);
          continue;
        }
        // A published story is indexed under its own headline and the original one; show each article to the AI once.
        const titles = [...new Set(published.matches(c.title, settings.candidateSimilarity, 8).map((m) => m.entry.ref.title))].slice(0, 3);
        const similar = titles.map((title, i) => ({ id: i + 1, title }));
        leaders.push({ c, similar });
        inWave.add(c.title, c);
      }

      if (dryRun) {
        for (const { c } of leaders) c.report.planned++;
        for (const c of next) c.report.planned++;
        log(`  dry run: ${leaders.length + next.length} item(s) would be sent to the AI`);
        break;
      }

      log(`  analyzing ${leaders.length} item(s) with the AI (round ${wave})`);
      await mapPool(leaders, settings.aiConcurrency, async ({ c, similar }) => {
        if (aiDown) {
          c.report.deferred++;
          c.report.deferredByAi++;
          return;
        }
        let outcome: AnalysisOutcome;
        try {
          outcome = await deps.analyze({
            title: c.title,
            description: c.description,
            sourceName: c.outlet,
            feedCategory: c.source.category,
            internationalFeed: c.source.category === "WORLD",
            publishedAt: c.publishedAt,
            now,
            similar,
          });
        } catch (error) {
          if (error instanceof AiUnavailableError) {
            // Affects every remaining item: stop calling the AI this run and retry them next run.
            if (!aiDown) log(`  ! AI UNAVAILABLE: ${error.message}. The remaining items are deferred to the next run.`);
            aiDown ??= error.message;
            c.report.deferred++;
            c.report.deferredByAi++;
            return;
          }
          c.report.aiErrors++;
          const message = describeError(error);
          c.report.firstAiError ??= message;
          log(`  ! ERROR      "${truncate(c.title, 70)}"  ${truncate(message, 100)}  <- ${c.outlet}`);
          return;
        }
        await serial(async () => {
          if (outcome.kind === "publish") return savePublished(c, outcome);
          if (outcome.kind === "duplicate") {
            const of = similar.find((s) => s.id === outcome.ofId)?.title ?? "an earlier story";
            log(`  = DUPLICATE  "${truncate(c.title, 70)}"  (AI: same story as "${truncate(of, 50)}")  <- ${c.outlet}`);
            return saveRejected(c, "duplicate", `of "${truncate(of, 60)}"`);
          }
          log(`  - REJECTED   ${outcome.reason}  "${truncate(c.title, 70)}"  <- ${c.outlet}`);
          return saveRejected(c, outcome.reason, outcome.note);
        });
      });
      if (aiDown) {
        for (const c of next) {
          c.report.deferred++;
          c.report.deferredByAi++;
        }
        break;
      }
      pending = next;
    }
    return finish();
  } finally {
    // 6. One IngestLog row per source fetched this run — written even if the run blew up part-way.
    if (!dryRun) {
      for (const r of reports) {
        if (r.notDue) continue;
        await store
          .writeLog({
            sourceId: r.sourceId,
            itemsFound: r.found,
            itemsPublished: r.published,
            itemsSkipped: r.found - r.published,
            error:
              r.error ??
              (r.deferredByAi ? `AI unavailable, ${r.deferredByAi} item(s) deferred to the next run: ${aiDown}` : null) ??
              (r.aiErrors ? `${r.aiErrors} item(s) failed AI analysis: ${r.firstAiError}` : null),
          })
          .catch((error: unknown) => log(`  could not write IngestLog for ${r.name}: ${describeError(error)}`));
      }
    }
  }

  function finish(): RunReport {
    return { startedAt, finishedAt: clock(), dryRun, sources: reports, aiUnavailable: aiDown };
  }
}
