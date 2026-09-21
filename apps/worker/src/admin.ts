// What the admin dashboard (apps/web, /admin) calls into. Everything here runs the SAME pipeline code as the
// scheduled worker (`runIngestion`), in the web server's process, so a manual "Fetch now" behaves exactly like
// a scheduled pass restricted to one source: same screening, same AI, same review switch, same IngestLog row.
//
// Imported as "@g12/worker/admin" (see this package's `exports`). Nothing here starts a scheduler.
import { describeError, fetchFeed } from "./ingest/feed";
import { runIngestion, type SourceReport } from "./ingest/pipeline";
import { aiConfigProblems } from "./lib/provider";
import { createRunDeps } from "./runtime";
import { loadSettings } from "./settings";

export interface SourceRunResult {
  /** False when nothing ran (already running, not configured, source inactive) or the feed could not be read. */
  ok: boolean;
  /** One plain sentence for the button's result line. */
  message: string;
  report: Pick<SourceReport, "found" | "published" | "queued" | "rejected" | "duplicates" | "alreadyIngested" | "tooOld" | "deferred" | "invalid" | "aiErrors"> | null;
  /** The pipeline's own progress lines, for the curious. */
  log: string[];
}

const failed = (message: string): SourceRunResult => ({ ok: false, message, report: null, log: [] });

// One manual run per source at a time: a double click must not start two AI passes over the same feed.
const running = new Set<string>();

/** One ingestion run for a single source: the manual "Fetch now". Ignores the per-feed minimum interval. */
export async function runSourceNow(sourceId: string): Promise<SourceRunResult> {
  if (running.has(sourceId)) return failed("A fetch for this source is already running.");
  const problems = [...(process.env.DATABASE_URL ? [] : ["DATABASE_URL"]), ...aiConfigProblems()];
  if (problems.length) return failed(`The website cannot run the AI pipeline: missing ${problems.join("; ")}. Put it in the root .env file and restart the website.`);

  running.add(sourceId);
  const log: string[] = [];
  try {
    const deps = await createRunDeps((line) => {
      if (log.length < 80) log.push(line);
    });
    const run = await runIngestion(deps, { force: true, sourceIds: [sourceId] });
    const r = run.sources[0];
    if (!r) return failed("That source is inactive or no longer exists. Turn it on under Sources first.");
    if (r.error) return { ok: false, message: `Could not read the feed: ${r.error}`, report: r, log };
    const parts = [`${r.found} item${r.found === 1 ? "" : "s"} in the feed`];
    if (r.published) parts.push(r.queued ? `${r.queued} queued for review` : `${r.published} published`);
    if (r.rejected) parts.push(`${r.rejected} rejected`);
    if (r.duplicates) parts.push(`${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"}`);
    if (r.alreadyIngested) parts.push(`${r.alreadyIngested} already saved`);
    if (r.tooOld) parts.push(`${r.tooOld} too old`);
    if (r.deferred) parts.push(`${r.deferred} left for the next run`);
    if (r.aiErrors) parts.push(`${r.aiErrors} failed AI checks`);
    const note = run.aiUnavailable ? ` The AI is unavailable: ${run.aiUnavailable}` : "";
    return { ok: !run.aiUnavailable && r.aiErrors === 0, message: `Done: ${parts.join(", ")}.${note}`, report: r, log };
  } catch (error) {
    return { ok: false, message: `The run failed: ${describeError(error)}`, report: null, log };
  } finally {
    running.delete(sourceId);
  }
}

export interface FeedCheck {
  ok: boolean;
  message: string;
}

/**
 * Does this address serve a usable feed, and how fresh is it? Used when a source is added or its address
 * changed. A feed that parses but is weeks old is reported as a problem: it would just sit there.
 */
export async function checkFeed(url: string): Promise<FeedCheck> {
  try {
    const items = await fetchFeed(url, loadSettings());
    if (items.length === 0) return { ok: false, message: "the feed loads but has no items" };
    const times = items.map((i) => i.publishedAt?.getTime()).filter((t): t is number => typeof t === "number");
    if (times.length === 0) return { ok: true, message: `${items.length} items (the feed gives no dates)` };
    const hours = Math.round((Date.now() - Math.max(...times)) / 3_600_000);
    if (hours > 24 * 7) return { ok: false, message: `${items.length} items, but the newest is ${Math.round(hours / 24)} days old: this feed is stale` };
    return { ok: true, message: `${items.length} items, newest ${hours < 1 ? "under an hour" : `${hours}h`} old` };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}
