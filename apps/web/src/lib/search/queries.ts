import type { CategoryId } from "@g12/config";
import { guarded, toArticle } from "../home/queries";
import type { HomeArticle } from "../home/types";
import { normalizeQuery, SEARCH_RESULT_LIMIT, toTsQuery } from "./query";

/**
 * Story search (server-only), shared by /api/search and the /search page.
 *
 * Postgres full-text search over a story's title, tags, excerpt and body, with the 'simple' dictionary
 * (no stemming, no stop words, so it behaves the same for English and Urdu) and prefix matching, so
 * results appear while the reader is still typing. Title matches count most, then tags, then excerpt,
 * then body (the weights A, B, C, D of ts_rank_cd). Results are ordered by that relevance, and among
 * equally relevant stories the newest comes first. Only PUBLISHED stories are ever searched.
 *
 * The search vector is computed as each query runs. At a few thousand stories that is a few
 * milliseconds; when the table grows to hundreds of thousands, add a GIN index on the same expression.
 * Like the other loaders, it THROWS on a database error, so callers can say "search is unavailable"
 * instead of a misleading "no results".
 */

export interface SearchResults {
  /** The normalized query that was searched. */
  query: string;
  /** At most SEARCH_RESULT_LIMIT stories, best match first. */
  results: HomeArticle[];
}

interface SearchRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  imageUrl: string | null;
  category: string;
  tags: string[];
  sourceName: string;
  /** ISO 8601 in UTC, formatted by the database so no driver has to guess the time zone. */
  publishedAtIso: string;
  urgencyScore: number;
  isBreaking: boolean;
}

export async function searchArticles(raw: string | null | undefined): Promise<SearchResults> {
  const query = normalizeQuery(raw);
  const tsquery = toTsQuery(query);
  if (!tsquery) return { query, results: [] };

  const results = await guarded<HomeArticle[]>([], async (prisma) => {
    try {
      const rows = await prisma.$queryRaw<SearchRow[]>`
        SELECT a.id, a.slug, a.title, a.excerpt, a."imageUrl", a.category::text AS category, a.tags,
               a."sourceName", a."urgencyScore", a."isBreaking",
               to_char(a."publishedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAtIso"
        FROM "Article" a
        CROSS JOIN LATERAL (
          SELECT to_tsquery('simple', ${tsquery}) AS q,
                 setweight(to_tsvector('simple', a.title), 'A')
                 || setweight(to_tsvector('simple', array_to_string(a.tags, ' ')), 'B')
                 || setweight(to_tsvector('simple', a.excerpt), 'C')
                 || setweight(to_tsvector('simple', a.body), 'D') AS v
        ) s
        WHERE a.status = 'PUBLISHED' AND s.v @@ s.q
        ORDER BY ts_rank_cd(s.v, s.q, 32) DESC, a."publishedAt" DESC, a.id ASC
        LIMIT ${SEARCH_RESULT_LIMIT}
      `;
      return rows.map((row) =>
        toArticle({
          id: row.id,
          slug: row.slug,
          title: row.title,
          excerpt: row.excerpt,
          imageUrl: row.imageUrl,
          category: row.category as CategoryId,
          tags: row.tags,
          sourceName: row.sourceName,
          publishedAt: new Date(row.publishedAtIso),
          urgencyScore: Number(row.urgencyScore),
          isBreaking: row.isBreaking,
        }),
      );
    } catch (error) {
      // Only the words go into the tsquery, so this should not happen; if the database still rejects one,
      // it is a query with nothing usable in it, not an outage.
      if (/tsquery|syntax error in/i.test(error instanceof Error ? error.message : String(error))) return [];
      throw error;
    }
  });

  return { query, results };
}
