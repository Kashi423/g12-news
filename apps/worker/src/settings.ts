import { BREAKING_URGENCY_THRESHOLD, MIN_FETCH_INTERVAL_MINUTES } from "@g12/config";
import { resolveProvider } from "./lib/provider";

export interface IngestSettings {
  /** How often the scheduler triggers a pass. */
  intervalMinutes: number;
  /** A feed is never fetched again sooner than this after its last fetch. */
  minFetchIntervalMs: number;
  fetchTimeoutMs: number;
  maxFeedBytes: number;
  userAgent: string;
  /** Feed items older than this are ignored (a news site should not resurface old stories). */
  maxItemAgeHours: number;
  /** Max new items sent to the AI per source per run; the rest are picked up on later runs. */
  maxItemsPerSource: number;
  /**
   * Max new items sent to the AI per run across all sources (0 = no limit). Spread round-robin over
   * the sources, newest first. Set for the free tier so the daily AI budget lasts all day.
   */
  maxItemsPerRun: number;
  feedConcurrency: number;
  aiConcurrency: number;
  /** How many of the latest published articles new items are compared against. */
  recentWindow: number;
  /**
   * Title similarity at/above which an item is dropped as the same story without asking the AI.
   * Deliberately strict: templated headlines ("A beat B by 5 wickets") score ~0.86, and wrongly
   * dropping a distinct story is worse than one extra AI call. Everything between
   * `candidateSimilarity` and this value goes to the AI to judge.
   */
  duplicateSimilarity: number;
  /** Auto-drop also requires this many distinctive words in common. */
  duplicateMinSharedTokens: number;
  /** Title similarity at/above which the AI is shown the earlier headline and asked to judge. */
  candidateSimilarity: number;
  minCategoryConfidence: number;
  breakingThreshold: number;
}

const ALLOWED_INTERVALS = [10, 12, 15, 20, 30, 60];

function intFrom(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/**
 * Reads tunables from the environment (all optional) so tests and the CLI can override them.
 * Defaults depend on the AI provider: the free Groq tier has a small daily budget, so it gets a
 * gentler profile (every 30 minutes, at most 5 new items per run) than the paid Anthropic one.
 */
export function loadSettings(env: NodeJS.ProcessEnv = process.env): IngestSettings {
  const free = resolveProvider(env) === "groq";
  const defaultInterval = free ? 30 : 15;
  const requested = intFrom(env.INGEST_INTERVAL_MINUTES, defaultInterval, 1, 1440);
  return {
    // Cron-friendly values only, and never below the per-feed minimum.
    intervalMinutes: ALLOWED_INTERVALS.includes(requested) ? requested : defaultInterval,
    minFetchIntervalMs: MIN_FETCH_INTERVAL_MINUTES * 60_000,
    fetchTimeoutMs: 20_000,
    maxFeedBytes: 5 * 1024 * 1024,
    userAgent: env.INGEST_USER_AGENT || "Mozilla/5.0 (compatible; G12NewsBot/1.0; automated news aggregator)",
    maxItemAgeHours: intFrom(env.INGEST_MAX_ITEM_AGE_HOURS, 24, 1, 168),
    maxItemsPerSource: intFrom(env.INGEST_MAX_ITEMS_PER_SOURCE, free ? 3 : 8, 1, 50),
    maxItemsPerRun: intFrom(env.INGEST_MAX_ITEMS_PER_RUN, free ? 5 : 0, 0, 500),
    feedConcurrency: 5,
    aiConcurrency: intFrom(env.INGEST_AI_CONCURRENCY, 3, 1, 10),
    recentWindow: 200,
    duplicateSimilarity: 0.9,
    duplicateMinSharedTokens: 4,
    candidateSimilarity: 0.4,
    minCategoryConfidence: 0.5,
    breakingThreshold: BREAKING_URGENCY_THRESHOLD,
  };
}
