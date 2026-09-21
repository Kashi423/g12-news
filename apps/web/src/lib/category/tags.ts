/**
 * Which tags to offer as filters on a category page. Pure: fed the tag lists of a category's most
 * recent stories (see queries.ts), it keeps the tags that recur, most frequent first.
 */

/** How many of the category's newest stories are looked at. Bounded, so it stays cheap as the archive grows. */
export const TAG_WINDOW = 300;
/** A tag must appear in at least this many stories to count as "often". */
export const TAG_MIN_COUNT = 2;
/** Most tags shown in the filter bar. */
export const TAG_LIMIT = 10;

export interface TagCount {
  tag: string;
  count: number;
}

export function topTags(
  tagLists: readonly (readonly string[])[],
  { minCount = TAG_MIN_COUNT, limit = TAG_LIMIT }: { minCount?: number; limit?: number } = {},
): TagCount[] {
  const counts = new Map<string, number>();
  for (const list of tagLists) {
    // Once per story, even if a tag were listed twice in it.
    for (const tag of new Set(list)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= minCount)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : 1))
    .slice(0, limit);
}
