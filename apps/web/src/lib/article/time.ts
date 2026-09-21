const TIME_ZONE = "Asia/Karachi";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TIME_ZONE });

/** "21 September 2026, 2:49 AM PKT": a story's date and time, in Pakistan time (fixed, so server and browser agree). */
export function formatStoryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${DATE.format(date)}, ${TIME.format(date).toUpperCase()} PKT`;
}

/** A correction earlier than this after publication is not worth an "Updated" line (clock skew, an immediate re-save). */
const MIN_UPDATE_GAP_MS = 60_000;

/** Whether to show "Updated": the story was changed after it was published. */
export function wasUpdated(publishedAt: string, correctedAt: string | null): boolean {
  if (!correctedAt) return false;
  const published = new Date(publishedAt).getTime();
  const corrected = new Date(correctedAt).getTime();
  if (Number.isNaN(published) || Number.isNaN(corrected)) return false;
  return corrected - published >= MIN_UPDATE_GAP_MS;
}
