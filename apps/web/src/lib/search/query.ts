/**
 * Turning what a reader typed into something safe to give the database's full-text search.
 * Pure functions, shared by the /api/search route, the /search page and the live overlay.
 */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 80;
/** Words beyond this many are ignored: every extra word is another condition the database must check. */
export const SEARCH_MAX_TERMS = 6;
export const SEARCH_RESULT_LIMIT = 20;
/** How long the overlay waits after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Trim, drop control characters, collapse runs of spaces and cap the length. Never throws; null becomes "". */
export function normalizeQuery(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_CHARS)
    .trim();
}

/**
 * The words of a query: letters and digits only (in any script), lower-cased, without repeats, at most
 * SEARCH_MAX_TERMS. One-letter words are dropped: as a prefix they would match half the newsroom.
 * Everything else (quotes, operators, punctuation) disappears here, which is what makes the result safe
 * to put into a tsquery.
 */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  for (const match of query.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const term = match[0];
    if (term.length < 2 || terms.includes(term)) continue;
    terms.push(term);
    if (terms.length === SEARCH_MAX_TERMS) break;
  }
  return terms;
}

/** Whether a query is worth sending to the server: long enough, with at least one real word in it. */
export function isSearchable(query: string): boolean {
  const q = normalizeQuery(query);
  return q.length >= SEARCH_MIN_CHARS && searchTerms(q).length > 0;
}

/**
 * The Postgres tsquery for a query: every word must appear, and each may be the start of a longer word,
 * so results appear while the reader is still typing ("chama" finds "Chamari"): `sri:* & lanka:*`.
 * Empty when the query has no usable word.
 */
export function toTsQuery(query: string): string {
  return searchTerms(normalizeQuery(query))
    .map((term) => `${term}:*`)
    .join(" & ");
}
