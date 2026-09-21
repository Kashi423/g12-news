import { SOURCE_LINK_REL } from "@g12/config";
import { safeHttpUrl } from "@/lib/article/links";

/**
 * "Originally reported by [Outlet]" with the link out. It sits straight after the story, in every
 * case, because it is the whole basis on which G12 News summarizes other outlets' reporting: the
 * reader is always sent to the original. The link opens a new tab and passes no ranking or referrer.
 */
export function SourceBox({ sourceName, sourceUrl }: { sourceName: string; sourceUrl: string }) {
  const href = safeHttpUrl(sourceUrl);
  return (
    <aside aria-labelledby="source-heading" data-testid="source-box" className="mt-8 border border-line border-l-4 border-l-brand bg-surface p-4 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Source</p>
      <h2 id="source-heading" className="mt-1 font-serif text-xl font-black leading-snug text-ink">
        Originally reported by {sourceName}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">G12 News summarizes reporting by other outlets. Read the original for the full story, quotes and pictures.</p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel={SOURCE_LINK_REL}
          data-testid="source-link"
          className="mt-3 inline-flex items-center gap-2 bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Read the original on {sourceName}
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </aside>
  );
}
