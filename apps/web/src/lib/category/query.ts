import { categoryPath } from "@g12/config";
import { decodeCursor, type CategorySort, type PageDirection, type Position } from "./paging";

/** Everything in the URL that shapes a category page, validated. Anything unrecognised falls back to the default. */
export interface CategoryQuery {
  sort: CategorySort;
  /** A tag to filter by (lowercase, as stored), or null. */
  tag: string | null;
  /** Where to start reading, or null for the first page. */
  cursor: { direction: PageDirection; position: Position } | null;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Tags are stored lowercase, 2-40 characters (see the worker's normalizeTags). */
const TAG_MIN = 2;
const TAG_MAX = 40;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Normalize a tag the way the worker stores it; null if it could not be a stored tag. */
export function parseTag(raw: string | undefined): string | null {
  if (!raw) return null;
  const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return tag.length >= TAG_MIN && tag.length <= TAG_MAX ? tag : null;
}

export function parseCategoryQuery(raw: RawSearchParams): CategoryQuery {
  const sort: CategorySort = first(raw.sort) === "viewed" ? "viewed" : "recent";
  const tag = parseTag(first(raw.tag));

  let cursor: CategoryQuery["cursor"] = null;
  const after = first(raw.after);
  const before = first(raw.before);
  const afterPosition = after ? decodeCursor(sort, after) : null;
  if (afterPosition) {
    cursor = { direction: "after", position: afterPosition };
  } else {
    const beforePosition = before ? decodeCursor(sort, before) : null;
    if (beforePosition) cursor = { direction: "before", position: beforePosition };
  }
  return { sort, tag, cursor };
}

/** The unfiltered, newest-first first page: the one canonical version of a category page. */
export function isDefaultView(query: CategoryQuery): boolean {
  return query.sort === "recent" && query.tag === null && query.cursor === null;
}

export interface CategoryLink {
  sort?: CategorySort;
  tag?: string | null;
  /** Encoded cursor (from `encodeCursor`) to read the stories after / before. */
  after?: string;
  before?: string;
}

/** URL of a category page. Defaults (newest first, no filter, first page) are left out so the plain URL stays canonical. */
export function categoryHref(slug: string, link: CategoryLink = {}): string {
  const params: string[] = [];
  if (link.tag) params.push(`tag=${encodeURIComponent(link.tag)}`);
  if (link.sort === "viewed") params.push("sort=viewed");
  if (link.after) params.push(`after=${encodeURIComponent(link.after)}`);
  else if (link.before) params.push(`before=${encodeURIComponent(link.before)}`);
  return params.length ? `${categoryPath(slug)}?${params.join("&")}` : categoryPath(slug);
}
