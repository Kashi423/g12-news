import { currentTime } from "@/lib/breaking/clock";
import { relativeTime } from "@/lib/breaking/time";

/**
 * "12 minutes ago" as plain server-rendered HTML: no client component, so a page with fifty story cards
 * does not hydrate fifty of them. It is kept current by the one script in PageEnhancements, which rewrites
 * every `time[data-relative]` on the page once when the page loads (the server's text may be up to a
 * minute old, since pages are cached) and every 30 seconds after that.
 * (The breaking bar and block keep the live version that reads the site clock: RelativeTime.)
 *
 * `suppressHydrationWarning`: that script may rewrite the text before React has finished hydrating this
 * element (the homepage is a cached copy, so the text usually IS out of date at that moment). Without it
 * React reports a text mismatch (error #418) and throws the part of the page away to render it again.
 * A time that differs from the server's is expected here, and React is told so.
 */
export function TimeAgo({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} data-relative="" className={className} title={new Date(iso).toUTCString()} suppressHydrationWarning>
      {relativeTime(iso, currentTime())}
    </time>
  );
}
