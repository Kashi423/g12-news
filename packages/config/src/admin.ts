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
