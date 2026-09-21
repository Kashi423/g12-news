"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useLiveSearch } from "@/lib/search/use-live-search";
import { isSearchable, normalizeQuery, SEARCH_MAX_CHARS, SEARCH_MIN_CHARS, SEARCH_RESULT_LIMIT } from "@/lib/search/query";
import { ArticleCard } from "../home/article-card";
import { BrowseSections } from "../search/browse-sections";

/**
 * The search icon, and the full-screen search overlay it opens (no page load). It is the browser's native
 * <dialog>, so focus is trapped inside, Esc closes it, and focus returns to the icon.
 *
 * Results appear as the reader types: the query is sent to /api/search once they pause for 300 ms, and the
 * stories (up to 20) are shown with the same card used everywhere else. Enter, or "See all results", goes
 * to the /search page for the same query, which is also the address to share or bookmark.
 * The overlay closes when a story or section is chosen, so it never covers the next page.
 */
export function SearchOverlay() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const search = useLiveSearch(query);
  const titleId = useId();
  const inputId = useId();

  const close = () => dialog.current?.close();

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  const noun = search.results.length === 1 ? "story" : "stories";
  const allResultsHref = `/search?q=${encodeURIComponent(search.query)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label="Search"
        aria-haspopup="dialog"
        data-testid="search-button"
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:mr-0"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        data-testid="search-overlay"
        onClick={(event) => {
          if (event.target === dialog.current) close(); // a click on the dim area
        }}
        className="fixed left-0 top-0 m-0 h-dvh max-h-none w-screen max-w-none bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/60 open:flex open:flex-col open:animate-fade-in motion-reduce:open:animate-none lg:h-auto lg:max-h-[92vh]"
      >
        <div className="shrink-0 border-b border-line">
          <div className="container py-4 lg:py-6">
            <div className="flex items-center justify-between gap-4">
              <h2 id={titleId} className="font-serif text-xl font-black text-brand">
                Search G12 News
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close search"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form
              action="/search"
              method="get"
              role="search"
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                // Enter goes to the full results page (a client-side navigation, no reload).
                event.preventDefault();
                const q = normalizeQuery(query);
                if (!isSearchable(q)) return;
                router.push(`/search?q=${encodeURIComponent(q)}`);
                close();
              }}
            >
              <label htmlFor={inputId} className="sr-only">
                Search stories
              </label>
              <input
                id={inputId}
                name="q"
                type="search"
                required
                minLength={SEARCH_MIN_CHARS}
                maxLength={SEARCH_MAX_CHARS}
                autoFocus
                autoComplete="off"
                enterKeyHint="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // A search box treats Esc as "clear the text" and swallows it; here Esc should always close.
                  if (event.key === "Escape") {
                    event.preventDefault();
                    close();
                  }
                }}
                placeholder="Search stories, people, places..."
                className="h-12 min-w-0 flex-1 border border-line bg-canvas px-4 text-base placeholder:text-muted focus:border-brand focus:outline focus:outline-2 focus:outline-brand"
              />
              <button type="submit" className="h-12 bg-brand px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                Search
              </button>
            </form>
          </div>
        </div>

        <div
          data-testid="search-scroll"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          // Choosing a story or section (or "See all results") closes the overlay before the next page appears.
          onClickCapture={(event) => {
            if ((event.target as Element).closest("a")) close();
          }}
        >
          <div className="container py-5 lg:py-6">
            <p role="status" aria-live="polite" data-testid="search-status" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted">
              {search.status === "idle" && <span>Type at least {SEARCH_MIN_CHARS} letters to search stories.</span>}
              {search.status === "loading" && <span>Searching&hellip;</span>}
              {search.status === "results" && (
                <>
                  <span>
                    <strong className="text-ink">{search.results.length}</strong> {noun} for &ldquo;{search.query}&rdquo;
                    {search.results.length === SEARCH_RESULT_LIMIT ? " (the top 20)" : ""}
                  </span>
                  <Link href={allResultsHref} className="font-semibold text-crimson hover:underline">
                    See all results <span aria-hidden="true">&rarr;</span>
                  </Link>
                </>
              )}
              {search.status === "empty" && (
                <span>
                  No stories match &ldquo;{search.query}&rdquo;. Check the spelling or try fewer words.
                </span>
              )}
              {search.status === "error" && (
                <span>
                  Search is temporarily unavailable.{" "}
                  <button type="button" onClick={search.retry} className="font-semibold text-crimson underline">
                    Try again
                  </button>
                </span>
              )}
            </p>

            {search.results.length > 0 && (
              <ul
                data-testid="search-results"
                aria-busy={search.stale}
                className={`mt-5 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${search.stale ? "opacity-50 transition-opacity" : ""}`}
              >
                {search.results.map((article) => (
                  <li key={article.id}>
                    <ArticleCard article={article} />
                  </li>
                ))}
              </ul>
            )}

            {(search.status === "idle" || search.status === "empty" || search.status === "error") && <BrowseSections className="mt-6" />}
          </div>
        </div>
      </dialog>
    </>
  );
}
