/**
 * Cursor (keyset) pagination for category pages. Pure: no database, so it is unit-tested directly.
 *
 * A page is 12 stories. "Older" and "Newer" links carry a cursor: the position of the story at the
 * edge of the current page. The next query asks the database for the stories strictly beyond that
 * position, so a page never skips or repeats a story when new ones are published in between (page
 * numbers and OFFSET would shift by one for every new story). Cursors live in the URL (`?after=` /
 * `?before=`), which keeps the Back button, sharing and no-JavaScript readers working.
 */

export const PAGE_SIZE = 12;

export type CategorySort = "recent" | "viewed";
/** `after`: the stories following the cursor (older, or less viewed). `before`: the ones preceding it. */
export type PageDirection = "after" | "before";

/** The fields that place a story in a listing. */
export interface Position {
  /** Only used by the "viewed" sort. */
  viewCount: number;
  publishedAt: Date;
  id: string;
}

type Field = keyof Position;
type Dir = "asc" | "desc";

/**
 * The full ordering of each sort. Every ordering ends in `id`, which is unique, so two stories never
 * tie and a cursor identifies exactly one place in the list.
 */
const ORDER: Record<CategorySort, readonly (readonly [Field, Dir])[]> = {
  recent: [
    ["publishedAt", "desc"],
    ["id", "asc"],
  ],
  viewed: [
    ["viewCount", "desc"],
    ["publishedAt", "desc"],
    ["id", "asc"],
  ],
};

const flip = (dir: Dir): Dir => (dir === "asc" ? "desc" : "asc");

/** Prisma `orderBy` for a sort. Paging "before" reads the list backwards, so every direction flips. */
export function orderBy(sort: CategorySort, direction: PageDirection): Array<Partial<Record<Field, Dir>>> {
  return ORDER[sort].map(([field, dir]) => ({ [field]: direction === "after" ? dir : flip(dir) }));
}

/** The shape of one `OR` branch of a keyset filter: equality on earlier fields, a range on one. */
export interface KeysetBranch {
  viewCount?: number | { lt?: number; gt?: number };
  publishedAt?: Date | { lt?: Date; gt?: Date };
  id?: string | { lt?: string; gt?: string };
}

/**
 * The filter for "strictly beyond `position`" in the sort's order. For (publishedAt desc, id asc) and
 * direction `after` it reads: publishedAt < t  OR  (publishedAt = t AND id > id). One branch per
 * ordering field: the first field strictly beyond, or equal with the next field strictly beyond.
 */
export function keysetWhere(sort: CategorySort, direction: PageDirection, position: Position): { OR: KeysetBranch[] } {
  const fields = ORDER[sort];
  const OR = fields.map(([field, dir], index) => {
    const branch: Record<string, unknown> = {};
    for (const [earlier] of fields.slice(0, index)) branch[earlier] = position[earlier];
    const towards = direction === "after" ? dir : flip(dir);
    branch[field] = { [towards === "desc" ? "lt" : "gt"]: position[field] };
    return branch as KeysetBranch;
  });
  return { OR };
}

// ---- cursors --------------------------------------------------------------------------------

// Sanity bounds so a hand-edited cursor can never reach the database as an out-of-range value.
const MIN_TIME = Date.UTC(2000, 0, 1);
const MAX_TIME = Date.UTC(2100, 0, 1);
const MAX_INT = 2_147_483_647;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Text for a story's position: `<publishedAt ms>.<id>`, or `<views>.<publishedAt ms>.<id>` for the viewed sort. */
export function encodeCursor(sort: CategorySort, story: { viewCount: number; publishedAt: Date | string; id: string }): string {
  const time = new Date(story.publishedAt).getTime();
  return sort === "viewed" ? `${story.viewCount}.${time}.${story.id}` : `${time}.${story.id}`;
}

/** The position a cursor stands for, or null if it is malformed (a stale or tampered link). */
export function decodeCursor(sort: CategorySort, raw: string): Position | null {
  const parts = raw.split(".");
  if (parts.length !== (sort === "viewed" ? 3 : 2)) return null;
  const id = parts[parts.length - 1];
  const time = Number(parts[parts.length - 2]);
  const viewCount = sort === "viewed" ? Number(parts[0]) : 0;
  if (!ID.test(id)) return null;
  if (!Number.isInteger(time) || time < MIN_TIME || time > MAX_TIME) return null;
  if (!Number.isInteger(viewCount) || viewCount < 0 || viewCount > MAX_INT) return null;
  return { viewCount, publishedAt: new Date(time), id };
}

// ---- shaping a fetched page ------------------------------------------------------------------

export interface PageEdges<T> {
  /** In display order (the sort's order), at most PAGE_SIZE. */
  items: T[];
  hasOlder: boolean;
  hasNewer: boolean;
}

/**
 * Turn the rows fetched (PAGE_SIZE + 1 of them, in the fetch's own order) into a page. The extra row
 * only proves there is more in the direction we were reading. Reading "before" comes back reversed.
 * The other direction's existence is known from how we got here: arriving with a cursor means
 * there is something on the far side of it.
 */
export function shapePage<T>(rows: readonly T[], direction: PageDirection, hasCursor: boolean): PageEdges<T> {
  const more = rows.length > PAGE_SIZE;
  const kept = rows.slice(0, PAGE_SIZE);
  if (direction === "before") return { items: kept.reverse(), hasNewer: more, hasOlder: true };
  return { items: kept, hasOlder: more, hasNewer: hasCursor };
}
