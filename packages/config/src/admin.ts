/**
 * Settings and thresholds shared by the admin dashboard (apps/web) and the ingestion pipeline (apps/worker).
 */

/** `Setting` row that holds the "Require review before publish" switch: "true" = on. A missing row = off. */
export const SETTING_REQUIRE_REVIEW = "requireReviewBeforePublish";

/** How a boolean setting is stored. Anything but "true" counts as off. */
export function parseSwitch(value: string | null | undefined): boolean {
  return value === "true";
}

/** A source with no successful fetch for this long, or a pipeline that has not run at all, raises the red banner. */
export const STALE_AFTER_HOURS = 2;
export const STALE_AFTER_MS = STALE_AFTER_HOURS * 3_600_000;

/** With review on, a story waiting longer than this raises the "queue is piling up" banner. */
export const REVIEW_STUCK_AFTER_HOURS = 4;
export const REVIEW_STUCK_AFTER_MS = REVIEW_STUCK_AFTER_HOURS * 3_600_000;

/**
 * Categories that get stricter automatic review even when "Require review before publish" is off:
 * politics and health are where a wrong or unconfirmed claim does the most damage. Crime, deaths and
 * disasters are not a category of their own (they fall under Pakistan/World), so the pipeline also
 * scans the text itself for that content (see apps/worker/src/ingest/sensitivity.ts).
 */
export const SENSITIVE_CATEGORIES = ["POLITICS", "HEALTH"] as const;

/**
 * A story's automatic quality score (0-100) below this is routed to review instead of publishing
 * outright. Deliberately conservative: a single-source story with no claims worth checking (a short
 * brief) already scores in the low 50s on the scoring model's own baseline (see
 * apps/worker/src/ingest/quality.ts), since most of a fresh story's score comes from source count and
 * agreement, which cannot be higher until a second outlet corroborates it. This threshold is meant to
 * catch stories that are unusually bad even for that baseline (stale, thin, or with failing claims on
 * top of being single-source), not to require corroboration before anything can auto-publish.
 */
export const AUTO_PUBLISH_QUALITY_THRESHOLD = 40;
