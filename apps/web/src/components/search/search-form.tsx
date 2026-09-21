import { SEARCH_MAX_CHARS, SEARCH_MIN_CHARS } from "@/lib/search/query";

/** The search box at the top of /search. A plain GET form, so it works without JavaScript. */
export function SearchForm({ defaultValue }: { defaultValue: string }) {
  return (
    <form action="/search" method="get" role="search" className="flex gap-2">
      <label htmlFor="search-page-q" className="sr-only">
        Search stories
      </label>
      <input
        id="search-page-q"
        name="q"
        type="search"
        required
        minLength={SEARCH_MIN_CHARS}
        maxLength={SEARCH_MAX_CHARS}
        autoComplete="off"
        enterKeyHint="search"
        defaultValue={defaultValue}
        placeholder="Search stories, people, places..."
        className="h-12 min-w-0 flex-1 border border-line bg-canvas px-4 text-base placeholder:text-muted focus:border-brand focus:outline focus:outline-2 focus:outline-brand"
      />
      <button type="submit" className="h-12 bg-brand px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        Search
      </button>
    </form>
  );
}
