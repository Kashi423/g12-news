import { AUTO_PUBLISH_QUALITY_THRESHOLD, SOURCES, type CategoryId } from "@g12/config";
import type { IngestSettings } from "../settings";
import { describeError, type FeedItem } from "./feed";
import { createSerializer, mapPool } from "./pool";
import { computeQualityScore } from "./quality";
import { isSensitiveStory } from "./sensitivity";
import { TitleIndex } from "./similarity";
import type { IngestStore, NewArticle, SourceRecord, SourceSnippet } from "./store";
import { plain, truncate, wordCount } from "./text";
import { AiUnavailableError, type AnalysisOutcome, type Analyzer, type RejectReason } from "./types";
import { canonicalizeUrl, slugify, uniqueSlug } from "./url";
import { finalUrgency } from "./urgency";
import { crossSourceVerify, hasFailingClaims, validateClaims, type ClaimAssessment, type SourceText } from "./verification";

/** At most one ingestion pass runs at a time; a stale lock (a crashed process) expires after this. */
const LOCK_KEY = "ingest";
const LOCK_TTL_MS = 15 * 60_000;

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
  /** Only these sources, by id (the admin dashboard's "Fetch now" for one source). */
  sourceIds?: string[];
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
  /** Accepted stories: live now, or (`queued`) held for review. */
  published: number;
  /** Of `published`, how many were saved as PENDING_REVIEW because the review switch was on. */
  queued: number;
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
  /** True when this call did nothing because another ingestion pass already held the lock. */
  lockSkipped?: boolean;
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
  imageCredit: string | null;
  guid: string | null;
}

/** A headline recently published or queued, for near-duplicate matching and clustering. */
interface KnownHeadline {
  title: string;
  id: string;
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
    queued: 0,
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

  // At most one pass runs at a time, across processes: a scheduled tick and a manual run (or the
  // admin dashboard's "Fetch now", which runs in the web server's own process) must not both hit the
  // same feeds. A dry run touches nothing, so it never needs the lock. A lock already held is not an
  // error: the caller (the scheduler, the CLI, the dashboard) decides whether to say anything about it.
  if (!dryRun && !(await store.acquireLock(LOCK_KEY, LOCK_TTL_MS))) {
    log("  another ingestion pass is already running; skipping this run");
    return { startedAt, finishedAt: clock(), dryRun, sources: [], aiUnavailable: null, lockSkipped: true };
  }

  const needle = options.sourceFilter?.toLowerCase();
  const ids = options.sourceIds ? new Set(options.sourceIds) : null;
  const sources = (await store.listActiveSources()).filter((s) => (!needle || `${s.name} ${s.rssUrl}`.toLowerCase().includes(needle)) && (!ids || ids.has(s.id)));
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
        list.push({ source, report, outlet, title: item.title, url, description: item.snippet, publishedAt, imageUrl: item.imageUrl, imageCredit: item.imageCredit ?? null, guid: item.guid ?? null });
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
    const published = new TitleIndex<KnownHeadline>();
    for (const article of await store.recentPublished(settings.recentWindow)) published.add(article.title, { title: article.title, id: article.id });

    const serial = createSerializer();
    let pending = candidates.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()); // earliest report first

    const snippetOf = (c: Candidate): SourceSnippet => ({
      sourceId: c.source.id,
      sourceName: c.outlet,
      url: c.url,
      guid: c.guid,
      title: c.title,
      description: c.description,
      publishedAt: c.publishedAt,
      reliability: c.source.reliability ?? 3,
    });

    // Cross-source verification, claim validation and the quality score they feed, all recomputed
    // from the cluster's current source list. Called once for a story's own lead report (from
    // savePublished, right after the Article row exists) and again whenever a later report is judged
    // the same story (see the duplicate-handling calls below): the cluster, not the Article, is where
    // "every source for this story" lives (requirement: story grouping). Never lets a clustering
    // problem take down the run it is riding on.
    const updateCluster = async (articleId: string, category: CategoryId, snippet: SourceSnippet): Promise<void> => {
      try {
        const attach = await store.attachSource(articleId, category, snippet);
        const sourceTexts: SourceText[] = attach.sources.map((s) => ({ sourceName: s.sourceName, title: s.title, description: s.description }));
        const verification = crossSourceVerify(sourceTexts);
        const claims: ClaimAssessment[] = validateClaims(attach.articleBody, sourceTexts);
        const nearestSimilarity = published.matches(snippet.title, settings.candidateSimilarity, 1)[0]?.score ?? 0;
        const quality = computeQualityScore({
          sourceReliabilities: attach.sources.map((s) => s.reliability),
          verification,
          claims,
          summaryWordCount: wordCount(attach.articleBody),
          publishedAt: snippet.publishedAt,
          now,
          nearestSimilarity,
        });
        await store.updateVerification(articleId, {
          qualityScore: quality.score,
          verification: { ...verification, claims, breakdown: quality.breakdown },
          developing: verification.agreement === "single-source",
          touchedContent: attach.added && attach.sources.length > 1,
        });
      } catch (error) {
        log(`  ! could not update the story cluster: ${describeError(error)}`);
      }
    };

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

    const savePublished = async (c: Candidate, outcome: Extract<AnalysisOutcome, { kind: "publish" }>, nearestSimilarity: number) => {
      const urgency = finalUrgency(outcome.urgencyScore, c.publishedAt, now, outcome.headline);
      const article: NewArticle = {
        slug: await uniqueSlug(outcome.slug, c.url, (s) => store.slugExists(s)),
        title: outcome.headline,
        excerpt: outcome.excerpt,
        body: outcome.summary,
        imageUrl: c.imageUrl,
        imageCredit: c.imageUrl ? c.imageCredit : null,
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

      // Claim validation and a quality estimate against this one source, ahead of the save: enough
      // to decide whether the story is fit to auto-publish (requirements #7-9) without yet touching
      // the database. `updateCluster` below repeats this against the cluster's full source list once
      // the Article row exists, which is identical for a brand-new story (still one source) and is
      // what later corroboration recomputes from.
      const soloSource: SourceText = { sourceName: c.outlet, title: c.title, description: c.description };
      const soloVerification = crossSourceVerify([soloSource]);
      const soloClaims = validateClaims(outcome.summary, [soloSource]);
      const soloQuality = computeQualityScore({
        sourceReliabilities: [c.source.reliability ?? 3],
        verification: soloVerification,
        claims: soloClaims,
        summaryWordCount: wordCount(outcome.summary),
        publishedAt: c.publishedAt,
        now,
        nearestSimilarity,
      });
      const sensitive = isSensitiveStory(outcome.category, c.title, outcome.headline, outcome.summary);
      // Below the quality floor, a sensitive story, or claims the story's own source does not back up:
      // held for a human even when "Require review before publish" is off (requirements #9, #16).
      const autoGate = soloQuality.score < AUTO_PUBLISH_QUALITY_THRESHOLD || sensitive || hasFailingClaims(soloClaims);

      // The review switch is read HERE, per story, straight before the save (never once per run or at
      // start-up), so flipping it applies to the very next story. It also applies to breaking stories:
      // the flag is kept, but a queued story is not live, so nothing is announced until it is approved.
      // If the read fails the story is not saved and is retried on the next run (fail closed).
      const review = (await store.requireReview()) || autoGate;
      article.status = review ? "PENDING_REVIEW" : "PUBLISHED";
      const result = await store.createArticle(article);
      let articleId: string;
      if (result.ok) {
        articleId = result.id;
      } else {
        if (result.conflict === "url") return void c.report.alreadyIngested++;
        // Slug raced with another writer: retry once with a URL-derived suffix.
        const retry = await store.createArticle({ ...article, slug: await uniqueSlug(`${article.slug}-${Date.now().toString(36)}`, c.url, (s) => store.slugExists(s)) });
        if (!retry.ok) return void c.report.alreadyIngested++;
        articleId = retry.id;
      }
      c.report.published++;
      if (review) c.report.queued++;
      // Later waves compare against both our headline and the original one other outlets may echo.
      published.add(article.title, { title: article.title, id: articleId });
      published.add(c.title, { title: article.title, id: articleId });
      // Say WHY it queued when the global switch did not force it, so the reason shows up in the log
      // and in "Fetch now"'s result line, not just the review queue itself.
      const queueNote = review && autoGate ? `  (${sensitive ? "sensitive" : hasFailingClaims(soloClaims) ? "unsupported claims" : "low quality score"}, waiting for review)` : review ? "  (waiting for review)" : "";
      log(`  + ${review ? "QUEUED   " : "PUBLISHED"}  [${article.category}] urgency ${urgency}${article.isBreaking ? " BREAKING" : ""}  "${article.title}"  <- ${c.outlet}${queueNote}`);
      await updateCluster(articleId, article.category, snippetOf(c));
    };

    let wave = 0;
    while (pending.length > 0) {
      wave++;
      const inWave = new TitleIndex<Candidate>();
      const leaders: { c: Candidate; similar: { id: number; title: string }[]; similarIds: string[]; nearestSimilarity: number }[] = [];
      const next: Candidate[] = [];

      for (const c of pending) {
        const strong = published.matches(c.title, settings.duplicateSimilarity, 1, settings.duplicateMinSharedTokens)[0];
        if (strong) {
          if (!dryRun) {
            await saveRejected(c, "duplicate", `of "${truncate(strong.entry.ref.title, 60)}"`);
            await updateCluster(strong.entry.ref.id, c.source.category, snippetOf(c));
          } else c.report.duplicates++;
          log(`  = DUPLICATE  "${truncate(c.title, 70)}"  ~ "${truncate(strong.entry.ref.title, 50)}"  <- ${c.outlet}`);
          continue;
        }
        // Similar to another item in this wave: decide after that one is done, so we compare against what was actually published.
        if (inWave.matches(c.title, settings.candidateSimilarity, 1).length > 0) {
          next.push(c);
          continue;
        }
        // A published story is indexed under its own headline and the original one; show each article to the AI once.
        const matches = published.matches(c.title, settings.candidateSimilarity, 8);
        const byTitle = new Map<string, string>(); // title -> article id, first (best-scoring) match wins
        for (const m of matches) if (!byTitle.has(m.entry.ref.title)) byTitle.set(m.entry.ref.title, m.entry.ref.id);
        const titles = [...byTitle.keys()].slice(0, 3);
        const similar = titles.map((title, i) => ({ id: i + 1, title }));
        leaders.push({ c, similar, similarIds: titles.map((t) => byTitle.get(t)!), nearestSimilarity: matches[0]?.score ?? 0 });
        inWave.add(c.title, c);
      }

      if (dryRun) {
        for (const { c } of leaders) c.report.planned++;
        for (const c of next) c.report.planned++;
        log(`  dry run: ${leaders.length + next.length} item(s) would be sent to the AI`);
        break;
      }

      log(`  analyzing ${leaders.length} item(s) with the AI (round ${wave})`);
      await mapPool(leaders, settings.aiConcurrency, async ({ c, similar, similarIds, nearestSimilarity }) => {
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
          if (outcome.kind === "publish") return savePublished(c, outcome, nearestSimilarity);
          if (outcome.kind === "duplicate") {
            const matchIndex = similar.findIndex((s) => s.id === outcome.ofId);
            const of = matchIndex >= 0 ? similar[matchIndex]!.title : "an earlier story";
            log(`  = DUPLICATE  "${truncate(c.title, 70)}"  (AI: same story as "${truncate(of, 50)}")  <- ${c.outlet}`);
            await saveRejected(c, "duplicate", `of "${truncate(of, 60)}"`);
            const leaderArticleId = matchIndex >= 0 ? similarIds[matchIndex] : undefined;
            if (leaderArticleId) await updateCluster(leaderArticleId, c.source.category, snippetOf(c));
            return;
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
      await store.releaseLock(LOCK_KEY).catch((error: unknown) => log(`  could not release the ingestion lock: ${describeError(error)}`));
    }
  }

  function finish(): RunReport {
    return { startedAt, finishedAt: clock(), dryRun, sources: reports, aiUnavailable: aiDown };
  }
}
