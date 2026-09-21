const TIME_ZONE = "Asia/Karachi";

/** Today's date in Pakistan time, in a long and a short form, plus the ISO date for <time dateTime>. */
export function formatToday(now: Date): { long: string; short: string; iso: string } {
  const long = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }).format(now);
  const short = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(now);
  // en-CA formats as YYYY-MM-DD
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
  return { long, short, iso };
}

/** `formatToday` for the current moment (kept here so components never call Date.now() themselves). */
export function today() {
  return formatToday(new Date());
}
