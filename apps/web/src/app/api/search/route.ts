import { NextResponse, type NextRequest } from "next/server";
import { searchArticles } from "@/lib/search/queries";
import { isSearchable, normalizeQuery, SEARCH_MIN_CHARS } from "@/lib/search/query";

// Reads the query string, so it is rendered per request.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
// The same search typed by many readers within half a minute costs the database once (on a CDN).
const SHORT_CACHE = { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" };

/**
 * GET /api/search?q=...
 *
 * The top 20 published stories matching the query in title, tags, excerpt or body, most relevant first
 * and, among equally relevant ones, newest first. The stories have the same shape as the homepage's cards
 * use, so the overlay can render them with the same card.
 *
 *   200 { query, count, results: HomeArticle[] }   (results may be empty)
 *   400 { error }                                   missing or too-short query
 *   503 { error }                                   the database is unavailable
 */
export async function GET(request: NextRequest) {
  const query = normalizeQuery(request.nextUrl.searchParams.get("q"));
  if (!isSearchable(query)) {
    return NextResponse.json({ error: `Type at least ${SEARCH_MIN_CHARS} letters to search.` }, { status: 400, headers: NO_STORE });
  }

  try {
    const { results } = await searchArticles(query);
    return NextResponse.json({ query, count: results.length, results }, { headers: SHORT_CACHE });
  } catch (error) {
    console.error(`[search] query failed: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503, headers: NO_STORE });
  }
}
