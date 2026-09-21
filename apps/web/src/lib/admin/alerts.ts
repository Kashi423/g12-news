import { REVIEW_STUCK_AFTER_HOURS, REVIEW_STUCK_AFTER_MS, STALE_AFTER_HOURS, STALE_AFTER_MS } from "@g12/config";
import { ago, formatAge, formatPkt } from "./time";

/**
 * The dashboard's warnings, decided in one place from a plain snapshot of the database. The banners on
 * /admin and the JSON at /api/admin/health (what an uptime monitor polls to email or text the owner) both
 * come from `computeAlerts`, so they can never disagree. To add another delivery channel (an email, a
 * Telegram message) call this and send whatever it returns.
 */

export interface SourceHealth {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  /** Last fetch ATTEMPT, good or bad. */
  lastFetchedAt: Date | null;
  /** Last attempt that worked. */
  lastSuccessAt: Date | null;
  lastError: string | null;
}

export interface HealthSnapshot {
  now: Date;
  requireReview: boolean;
  sources: SourceHealth[];
  /** Newest IngestLog row (any source). */
  lastRunAt: Date | null;
  pendingCount: number;
  /** Stories waiting in the review queue longer than REVIEW_STUCK_AFTER_HOURS. */
  stuckCount: number;
  oldestPendingAt: Date | null;
}

export interface Alert {
  id: "no-sources" | "pipeline-stopped" | "sources-stale" | "review-stuck";
  /** "error" is the red banner (the pipeline is not doing its job); "warning" is the amber one. */
  level: "error" | "warning";
  title: string;
  detail: string;
  /** One line per affected source, for the stale-sources banner. */
  items: string[];
}

/**
 * When the source last fetched successfully. Works whichever worker version wrote the row: an older
 * worker sets only lastFetchedAt/lastError, and an attempt with no error is a success.
 */
export function lastSuccess(source: Pick<SourceHealth, "lastFetchedAt" | "lastSuccessAt" | "lastError">): Date | null {
  const times = [source.lastSuccessAt, source.lastError === null ? source.lastFetchedAt : null].filter((t): t is Date => t !== null);
  return times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null;
}

/** An active source with no successful fetch in over 2 hours (a source added under 2 hours ago gets that long to fetch once). */
export function isStale(source: SourceHealth, now: Date): boolean {
  return source.isActive && now.getTime() - (lastSuccess(source) ?? source.createdAt).getTime() > STALE_AFTER_MS;
}

export function computeAlerts(snapshot: HealthSnapshot): Alert[] {
  const { now } = snapshot;
  const alerts: Alert[] = [];
  const active = snapshot.sources.filter((s) => s.isActive);

  if (active.length === 0) {
    alerts.push({ id: "no-sources", level: "error", title: "No source is switched on", detail: "Nothing is being fetched. Add or activate a source under Sources.", items: [] });
  } else {
    // "The pipeline has run" = anything at all was fetched or logged. Every pass touches every due source.
    const attempts = [snapshot.lastRunAt, ...snapshot.sources.map((s) => s.lastFetchedAt)].filter((t): t is Date => t !== null);
    const lastRun = attempts.length ? new Date(Math.max(...attempts.map((t) => t.getTime()))) : null;
    if (!lastRun) {
      alerts.push({ id: "pipeline-stopped", level: "error", title: "The pipeline has never run", detail: "No source has ever been fetched. Is the worker running (npm run start:worker)?", items: [] });
    } else if (now.getTime() - lastRun.getTime() > STALE_AFTER_MS) {
      alerts.push({
        id: "pipeline-stopped",
        level: "error",
        title: `The pipeline has not run for ${formatAge(now.getTime() - lastRun.getTime())}`,
        detail: `Last activity was ${formatPkt(lastRun)}. The site is not getting new stories: check that the worker is running (npm run start:worker) and can reach the database.`,
        items: [],
      });
    } else {
      // The pipeline is alive, so a source that still has not fetched is a problem of its own. (When the whole
      // pipeline is down every source is stale; that is one banner, not thirty.)
      const stale = active.filter((s) => isStale(s, now));
      if (stale.length > 0) {
        alerts.push({
          id: "sources-stale",
          level: "error",
          title: `${stale.length} source${stale.length === 1 ? " has" : "s have"} not fetched successfully in over ${STALE_AFTER_HOURS} hours`,
          detail: "Open Pipeline health to see the error and use Fetch now to retry.",
          items: stale.map((s) => {
            const last = lastSuccess(s);
            return `${s.name}: ${last ? `last success ${ago(last, now)}` : `never fetched successfully (added ${ago(s.createdAt, now)})`}${s.lastError ? ` (${s.lastError.slice(0, 140)})` : ""}`;
          }),
        });
      }
    }
  }

  if (snapshot.requireReview && snapshot.stuckCount > 0 && snapshot.oldestPendingAt) {
    alerts.push({
      id: "review-stuck",
      level: "warning",
      title: `${snapshot.stuckCount} stor${snapshot.stuckCount === 1 ? "y has" : "ies have"} been waiting for review for over ${REVIEW_STUCK_AFTER_HOURS} hours`,
      detail: `The oldest has waited ${formatAge(now.getTime() - snapshot.oldestPendingAt.getTime())}. Nothing reaches the site until you approve it: open Pending review.`,
      items: [],
    });
  }
  return alerts;
}

/** Is a story that entered the review queue at `since` overdue? */
export function isOverdue(since: Date, now: Date): boolean {
  return now.getTime() - since.getTime() > REVIEW_STUCK_AFTER_MS;
}
