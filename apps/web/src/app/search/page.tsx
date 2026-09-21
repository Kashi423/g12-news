import type { Metadata } from "next";
import { ArticleCard } from "@/components/home/article-card";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { BrowseSections } from "@/components/search/browse-sections";
import { SearchForm } from "@/components/search/search-form";
import { searchArticles } from "@/lib/search/queries";
import { isSearchable, normalizeQuery, SEARCH_MIN_CHARS, SEARCH_RESULT_LIMIT } from "@/lib/search/query";

// Reads ?q=, so it is rendered for each request. It never answers 404: an empty or odd query is a page
// with a message, and the same address is what the overlay's "See all results" and a shared link open.

interface Props {
  searchParams: Promise<{ q?: string | string[] }>;
}

async function queryFrom(searchParams: Props["searchParams"]): Promise<string> {
  const raw = (await searchParams).q;
  return normalizeQuery(Array.isArray(raw) ? raw[0] : raw);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = await queryFrom(searchParams);
  return {
    title: isSearchable(q) ? `Search: ${q}` : "Search",
    description: "Search stories on G12 News.",
    // Search results are not pages worth indexing (and each query would be a new one).
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const q = await queryFrom(searchParams);
  const searchable = isSearchable(q);
  const { results } = searchable ? await searchArticles(q) : { results: [] };
  const noun = results.length === 1 ? "story" : "stories";

  return (
    <div className="container pb-12 pt-5 lg:pt-6">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <h1 className="mt-4 font-serif text-[1.9rem] font-black leading-tight tracking-tight text-ink sm:text-4xl">{searchable ? <>Results for &ldquo;{q}&rdquo;</> : "Search"}</h1>

      <div className="mt-5 max-w-2xl">
        <SearchForm defaultValue={q} />
      </div>

      <div className="mt-6" aria-live="polite">
        {!searchable && (
          <>
            <p data-testid="search-prompt" className="text-muted">
              {q === "" ? "Type a name, place or topic to find stories." : `Type at least ${SEARCH_MIN_CHARS} letters (a word, a name or a place) to search.`}
            </p>
            <BrowseSections className="mt-6" />
          </>
        )}

        {searchable && results.length > 0 && (
          <>
            <p data-testid="search-count" className="text-sm text-muted">
              <strong className="text-ink">{results.length}</strong> {noun} found
              {results.length === SEARCH_RESULT_LIMIT ? ` (showing the ${SEARCH_RESULT_LIMIT} best matches)` : ""}, best match first
            </p>
            <ul data-testid="search-results" className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((article, index) => (
                <li key={article.id}>
                  <ArticleCard article={article} headingLevel="h2" eager={index === 0} />
                </li>
              ))}
            </ul>
          </>
        )}

        {searchable && results.length === 0 && (
          <div data-testid="search-empty" className="flex flex-col items-center border border-dashed border-line bg-surface px-6 py-14 text-center">
            <h2 className="font-serif text-2xl font-black tracking-tight text-brand">No stories found</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Nothing matches &ldquo;{q}&rdquo;. Check the spelling, try fewer or different words, or browse a section below.
            </p>
            <BrowseSections className="mt-6" />
          </div>
        )}
      </div>
    </div>
  );
}
