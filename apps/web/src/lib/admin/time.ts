/** Time helpers for the admin pages. Everything is shown in Pakistan time, like the rest of the site. */
const TIME_ZONE = "Asia/Karachi";
// Pakistan has no daylight saving time (abolished 2009), so its day always starts at 19:00 UTC the evening before.
const PKT_OFFSET = "+05:00";

/** "5 min", "3 h 12 min", "2 d 4 h": how long something has been going on. */
export function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} d${hours % 24 ? ` ${hours % 24} h` : ""}`;
}

/** "3 h 12 min ago", or "never". */
export function ago(date: Date | null | undefined, now: Date): string {
  return date ? `${formatAge(now.getTime() - date.getTime())} ago` : "never";
}

/** "21 Sept, 14:05" in Pakistan time. */
export function formatPkt(date: Date | null | undefined): string {
  if (!date) return "never";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE }).format(date);
}

/** The Pakistan calendar day containing `now`: its date ("2026-09-21") and the instant it began. */
export function pakistanDay(now: Date): { ymd: string; start: Date } {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now); // en-CA prints YYYY-MM-DD
  return { ymd, start: new Date(`${ymd}T00:00:00${PKT_OFFSET}`) };
}
