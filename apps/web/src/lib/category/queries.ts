import type { CategoryId } from "@g12/config";
import { guarded, SELECT, toArticle } from "../home/queries";
import type { HomeArticle } from "../home/types";
import { encodeCursor, keysetWhere, orderBy, PAGE_SIZE, shapePage, type PageDirection } from "./paging";
import type { CategoryQuery } from "./query";
import { TAG_WINDOW, topTags, type TagCount } from "./tags";

/**
 * Database reads for /category/[slug] (server-only). Like the homepage loaders, they THROW on a
 * database error, so the error page appears instead of a page that wrongly says "no stories yet".
 * With no DATABASE_URL at all (local UI work) they return empty results.
 */

export interface CategoryPage {
  /** Newest first (or most viewed first), at most PAGE_SIZE, all PUBLISHED and in this category. */
  articles: HomeArticle[];
  /** Cursor for the "Older stories" link (`?after=`), or null when this is the last page. */
  olderCursor: string | null;
  /** Cursor for the "Newer stories" link (`?before=`), or null when this is the first page. */
  newerCursor: string | null;
}

const EMPTY_PAGE: CategoryPage = { articles: [], olderCursor: null, newerCursor: null };

type Prisma = (typeof import("@g12/db"))["prisma"];

async function fetchRows(prisma: Prisma, category: CategoryId, query: CategoryQuery, cursor: CategoryQuery["cursor"]) {
  const direction: PageDirection = cursor?.direction ?? "after";
  return prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      category,
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(cursor ? keysetWhere(query.sort, direction, cursor.position) : {}),
    },
    orderBy: orderBy(query.sort, direction),
    // One more than a page: its presence is how we know there is another page.
    take: PAGE_SIZE + 1,
    // viewCount is only needed to build the cursor of the "viewed" sort; it is not passed on to the cards.
    select: { ...SELECT, viewCount: true },
  });
}

/** One page of a category's stories, in the order the URL asks for, from the cursor the URL carries. */
export async function getCategoryPage(category: CategoryId, query: CategoryQuery): Promise<CategoryPage> {
  return guarded(EMPTY_PAGE, async (prisma) => {
    let cursor = query.cursor;
    let rows = await fetchRows(prisma, category, query, cursor);

    // A cursor that leads nowhere (the story was removed, or the link is old), or a "Newer" page that
    // ran out of newer stories before filling up: show the first page rather than an empty or short one.
    if (cursor && (rows.length === 0 || (cursor.direction === "before" && rows.length < PAGE_SIZE))) {
      cursor = null;
      rows = await fetchRows(prisma, category, query, null);
    }

    const { items, hasOlder, hasNewer } = shapePage(rows, cursor?.direction ?? "after", cursor !== null);
    if (items.length === 0) return EMPTY_PAGE;

    const last = items[items.length - 1];
    return {
      articles: items.map(toArticle),
      olderCursor: hasOlder ? encodeCursor(query.sort, last) : null,
      newerCursor: hasNewer ? encodeCursor(query.sort, items[0]) : null,
    };
  });
}

// The tag list changes slowly and costs a scan of the category's recent stories, so it is remembered
// for a minute rather than recomputed on every page view.
const TAG_CACHE_MS = 60_000;
const tagCache = new Map<CategoryId, { at: number; tags: TagCount[] }>();

/** The tags that recur in a category's recent stories: the topics offered in the filter bar. */
export async function getCategoryTags(category: CategoryId): Promise<TagCount[]> {
  const hit = tagCache.get(category);
  if (hit && Date.now() - hit.at < TAG_CACHE_MS) return hit.tags;
  try {
    return await guarded([], async (prisma) => {
      const rows = await prisma.article.findMany({
        where: { status: "PUBLISHED", category },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        take: TAG_WINDOW,
        select: { tags: true },
      });
      const tags = topTags(rows.map((row) => row.tags));
      tagCache.set(category, { at: Date.now(), tags });
      return tags;
    });
  } catch (error) {
    // The topic filter is a nicety: if only this query fails, the list itself should still show.
    console.warn(`[category] could not load topics for ${category}: ${error instanceof Error ? error.message : error}`);
    return hit?.tags ?? [];
  }
}
