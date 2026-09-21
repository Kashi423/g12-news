import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORIES, CATEGORY_BY_ID } from "@g12/config";
import { parseSiteUrl } from "../site-url";
import { categoryDescription, categoryMetadata, categoryTitle } from "./metadata";
import {
  decodeCursor,
  encodeCursor,
  keysetWhere,
  orderBy,
  PAGE_SIZE,
  shapePage,
  type CategorySort,
  type KeysetBranch,
  type PageDirection,
  type Position,
} from "./paging";
import { categoryHref, isDefaultView, parseCategoryQuery, parseTag } from "./query";
import { topTags } from "./tags";

// ---- a tiny in-memory stand-in for the database, driven by the real orderBy / keysetWhere ------

interface Row extends Position {
  label: string;
}

const T0 = Date.UTC(2026, 8, 21, 12, 0, 0);
/**
 * 40 stories with deliberate ties: three share each timestamp, and view counts repeat (0,10,...,40),
 * so both sorts must fall back to the tie-breakers to keep a stable, gap-free order.
 */
const ROWS: Row[] = Array.from({ length: 40 }, (_, i) => ({
  // Shuffled relative to time (7 is coprime with 40), so a tie-break bug cannot hide behind ids that happen to rise with age.
  id: `r${String((i * 7) % 40).padStart(3, "0")}`,
  label: `story ${i}`,
  publishedAt: new Date(T0 - Math.floor(i / 3) * 60_000),
  viewCount: (i % 5) * 10,
}));

const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
const value = (v: unknown) => (v instanceof Date ? v.getTime() : v);

function matchesBranch(row: Row, branch: KeysetBranch): boolean {
  return Object.entries(branch).every(([field, cond]) => {
    const actual = row[field as keyof Position];
    if (cond instanceof Date || typeof cond !== "object") return same(actual, cond);
    const { lt, gt } = cond as { lt?: unknown; gt?: unknown };
    if (lt !== undefined) return (value(actual) as number) < (value(lt) as number) || (typeof actual === "string" && actual < (lt as string));
    return (value(actual) as number) > (value(gt) as number) || (typeof actual === "string" && actual > (gt as string));
  });
}

/** What Prisma would return: filter by the keyset, order by orderBy(), take PAGE_SIZE + 1. */
function fetchRows(sort: CategorySort, direction: PageDirection, position?: Position): Row[] {
  const where = position ? keysetWhere(sort, direction, position) : null;
  const order = orderBy(sort, direction);
  return ROWS.filter((row) => !where || where.OR.some((branch) => matchesBranch(row, branch)))
    .sort((a, b) => {
      for (const key of order) {
        const [field, dir] = Object.entries(key)[0] as [keyof Position, "asc" | "desc"];
        const x = value(a[field]) as number | string;
        const y = value(b[field]) as number | string;
        if (x !== y) return (x < y ? -1 : 1) * (dir === "asc" ? 1 : -1);
      }
      return 0;
    })
    .slice(0, PAGE_SIZE + 1);
}

/** Follow "Older" links from the first page to the end, through real (encoded) cursors. */
function walkOlder(sort: CategorySort): Row[][] {
  const pages: Row[][] = [];
  let position: Position | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const { items, hasOlder } = shapePage(fetchRows(sort, "after", position), "after", position !== undefined);
    pages.push(items);
    if (!hasOlder) return pages;
    position = decodeCursor(sort, encodeCursor(sort, items[items.length - 1])) ?? undefined;
    assert.ok(position, "the cursor of a real story must decode");
  }
  throw new Error("pagination did not terminate");
}

const labels = (rows: Row[]) => rows.map((r) => r.label);

describe("orderBy", () => {
  it("orders newest first, with the id as a tie-break", () => {
    assert.deepEqual(orderBy("recent", "after"), [{ publishedAt: "desc" }, { id: "asc" }]);
  });

  it("orders most viewed first, then newest, then id", () => {
    assert.deepEqual(orderBy("viewed", "after"), [{ viewCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }]);
  });

  it("reads backwards for 'before' by flipping every direction", () => {
    assert.deepEqual(orderBy("recent", "before"), [{ publishedAt: "asc" }, { id: "desc" }]);
    assert.deepEqual(orderBy("viewed", "before"), [{ viewCount: "asc" }, { publishedAt: "asc" }, { id: "desc" }]);
  });
});

describe("keysetWhere", () => {
  const position: Position = { viewCount: 20, publishedAt: new Date(T0), id: "r005" };

  it("asks for stories strictly older than the cursor, breaking timestamp ties by id", () => {
    assert.deepEqual(keysetWhere("recent", "after", position), {
      OR: [{ publishedAt: { lt: position.publishedAt } }, { publishedAt: position.publishedAt, id: { gt: "r005" } }],
    });
  });

  it("mirrors that for 'before'", () => {
    assert.deepEqual(keysetWhere("recent", "before", position), {
      OR: [{ publishedAt: { gt: position.publishedAt } }, { publishedAt: position.publishedAt, id: { lt: "r005" } }],
    });
  });

  it("adds the view count as the leading field for the viewed sort", () => {
    assert.deepEqual(keysetWhere("viewed", "after", position).OR, [
      { viewCount: { lt: 20 } },
      { viewCount: 20, publishedAt: { lt: position.publishedAt } },
      { viewCount: 20, publishedAt: position.publishedAt, id: { gt: "r005" } },
    ]);
  });
});

describe("paging through a list with ties", () => {
  for (const sort of ["recent", "viewed"] as const) {
    it(`${sort}: following Older links visits every story exactly once, in order`, () => {
      const pages = walkOlder(sort);
      assert.deepEqual(pages.map((p) => p.length), [12, 12, 12, 4]);
      const everything = pages.flat();
      assert.equal(new Set(everything.map((r) => r.id)).size, ROWS.length, "no story repeated or skipped");
      const expected = fetchRows(sort, "after");
      assert.deepEqual(labels(everything.slice(0, PAGE_SIZE + 1)), labels(expected), "the first page matches a direct query");
      // Sorted as promised: never a later story ahead of an earlier one.
      for (let i = 1; i < everything.length; i++) {
        const a = everything[i - 1];
        const b = everything[i];
        if (sort === "viewed" && a.viewCount !== b.viewCount) assert.ok(a.viewCount > b.viewCount);
        else if (a.publishedAt.getTime() !== b.publishedAt.getTime()) assert.ok(a.publishedAt > b.publishedAt);
        else assert.ok(a.id < b.id);
      }
    });

    it(`${sort}: following Newer links from the last page walks back through the same pages`, () => {
      const forward = walkOlder(sort);
      let pages = forward.length - 1;
      let first = forward[pages][0];
      while (pages > 0) {
        const cursor = decodeCursor(sort, encodeCursor(sort, first));
        assert.ok(cursor);
        const { items, hasNewer, hasOlder } = shapePage(fetchRows(sort, "before", cursor), "before", true);
        assert.deepEqual(labels(items), labels(forward[pages - 1]), `page ${pages} back to ${pages - 1}`);
        assert.equal(hasOlder, true);
        assert.equal(hasNewer, pages - 1 > 0, "only the very first page has nothing newer");
        pages -= 1;
        first = items[0];
      }
    });
  }

  it("reaching the newest stories from a cursor near the top yields a short page with nothing newer", () => {
    const cursor = decodeCursor("recent", encodeCursor("recent", ROWS[5]));
    assert.ok(cursor);
    const { items, hasNewer } = shapePage(fetchRows("recent", "before", cursor), "before", true);
    assert.equal(items.length, 5);
    assert.equal(hasNewer, false);
  });
});

describe("shapePage", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("reports another page only when the extra row is present", () => {
    assert.deepEqual(shapePage(rows(13), "after", false), { items: rows(12), hasOlder: true, hasNewer: false });
    assert.deepEqual(shapePage(rows(12), "after", false), { items: rows(12), hasOlder: false, hasNewer: false });
    assert.deepEqual(shapePage(rows(3), "after", false), { items: rows(3), hasOlder: false, hasNewer: false });
  });

  it("knows there is a newer page when it arrived through a cursor", () => {
    assert.equal(shapePage(rows(5), "after", true).hasNewer, true);
  });

  it("puts a page read backwards into display order and drops the extra row from the far end", () => {
    // Fetched nearest-first: 0 is adjacent to the cursor, 12 is the extra one.
    const page = shapePage(rows(13), "before", true);
    assert.deepEqual(page.items, rows(12).reverse());
    assert.equal(page.hasNewer, true);
    assert.equal(page.hasOlder, true);
  });

  it("handles no rows", () => {
    assert.deepEqual(shapePage([], "after", false), { items: [], hasOlder: false, hasNewer: false });
  });
});

describe("cursors", () => {
  const story = { viewCount: 137, publishedAt: new Date("2026-09-21T09:30:15.123Z"), id: "cmg8x9abc0001" };

  it("round-trips exactly, including milliseconds", () => {
    assert.deepEqual(decodeCursor("recent", encodeCursor("recent", story)), { viewCount: 0, publishedAt: story.publishedAt, id: story.id });
    assert.deepEqual(decodeCursor("viewed", encodeCursor("viewed", story)), story);
  });

  it("accepts the ISO string a card carries as well as a Date", () => {
    assert.equal(encodeCursor("recent", { ...story, publishedAt: story.publishedAt.toISOString() }), encodeCursor("recent", story));
  });

  it("rejects anything that is not a cursor for that sort", () => {
    const good = encodeCursor("recent", story);
    for (const bad of ["", "abc", "1.2.3.4", "x.cmg8x9abc0001", "-5.cmg", `${story.publishedAt.getTime()}.`, `${story.publishedAt.getTime()}.bad id`, `${story.publishedAt.getTime()}.a/b`, "1.abc", "9999999999999999.abc", `${good}.extra`]) {
      assert.equal(decodeCursor("recent", bad), null, JSON.stringify(bad));
    }
    // A cursor made for one sort is not valid for the other.
    assert.equal(decodeCursor("viewed", good), null);
    assert.equal(decodeCursor("recent", encodeCursor("viewed", story)), null);
    // Impossible view counts.
    assert.equal(decodeCursor("viewed", `-1.${story.publishedAt.getTime()}.abc`), null);
    assert.equal(decodeCursor("viewed", `2147483648.${story.publishedAt.getTime()}.abc`), null);
    assert.equal(decodeCursor("viewed", `1.5.${story.publishedAt.getTime()}.abc`), null);
  });
});

describe("parseCategoryQuery", () => {
  const cursor = encodeCursor("recent", ROWS[3]);

  it("defaults to newest first, unfiltered, first page", () => {
    assert.deepEqual(parseCategoryQuery({}), { sort: "recent", tag: null, cursor: null });
    assert.equal(isDefaultView(parseCategoryQuery({})), true);
  });

  it("understands sort=viewed and ignores any other sort value", () => {
    assert.equal(parseCategoryQuery({ sort: "viewed" }).sort, "viewed");
    assert.equal(parseCategoryQuery({ sort: "popular" }).sort, "recent");
    assert.equal(parseCategoryQuery({ sort: ["viewed", "recent"] }).sort, "viewed");
  });

  it("normalizes tags the way the worker stores them, and ignores impossible ones", () => {
    assert.equal(parseTag("  Imran   KHAN "), "imran khan");
    assert.equal(parseTag("x"), null);
    assert.equal(parseTag("a".repeat(41)), null);
    assert.equal(parseTag(""), null);
    assert.equal(parseTag(undefined), null);
    assert.equal(parseCategoryQuery({ tag: ["cricket", "psl"] }).tag, "cricket");
  });

  it("reads an 'after' or 'before' cursor, and an 'after' one wins", () => {
    assert.equal(parseCategoryQuery({ after: cursor })?.cursor?.direction, "after");
    assert.equal(parseCategoryQuery({ before: cursor })?.cursor?.direction, "before");
    assert.equal(parseCategoryQuery({ after: cursor, before: cursor })?.cursor?.direction, "after");
    assert.equal(parseCategoryQuery({ after: cursor })?.cursor?.position.id, ROWS[3].id);
  });

  it("ignores a malformed cursor and falls back to a valid one, else the first page", () => {
    assert.equal(parseCategoryQuery({ after: "garbage" }).cursor, null);
    assert.equal(parseCategoryQuery({ after: "garbage", before: cursor }).cursor?.direction, "before");
    assert.equal(parseCategoryQuery({ sort: "viewed", after: cursor }).cursor, null, "a 'recent' cursor is not valid for 'viewed'");
  });

  it("does not treat a filtered, re-sorted or later page as the default view", () => {
    assert.equal(isDefaultView(parseCategoryQuery({ tag: "cricket" })), false);
    assert.equal(isDefaultView(parseCategoryQuery({ sort: "viewed" })), false);
    assert.equal(isDefaultView(parseCategoryQuery({ after: cursor })), false);
  });
});

describe("categoryHref", () => {
  it("is just the category path for the default view", () => {
    assert.equal(categoryHref("sports"), "/category/sports");
    assert.equal(categoryHref("sports", { sort: "recent", tag: null }), "/category/sports");
  });

  it("adds only what differs from the default", () => {
    assert.equal(categoryHref("sports", { tag: "cricket" }), "/category/sports?tag=cricket");
    assert.equal(categoryHref("sports", { sort: "viewed" }), "/category/sports?sort=viewed");
    assert.equal(categoryHref("sports", { tag: "cricket", sort: "viewed" }), "/category/sports?tag=cricket&sort=viewed");
  });

  it("encodes tags with spaces or symbols so they survive the round trip", () => {
    const href = categoryHref("politics", { tag: "imran khan" });
    assert.equal(href, "/category/politics?tag=imran%20khan");
    assert.equal(parseCategoryQuery(Object.fromEntries(new URL(href, "http://x").searchParams)).tag, "imran khan");
    assert.equal(parseTag(new URL(categoryHref("x", { tag: "r&d" }), "http://x").searchParams.get("tag") ?? ""), "r&d");
  });

  it("carries a cursor, and never both directions at once", () => {
    assert.equal(categoryHref("sports", { after: "1.a" }), "/category/sports?after=1.a");
    assert.equal(categoryHref("sports", { before: "1.a", tag: "psl" }), "/category/sports?tag=psl&before=1.a");
    assert.equal(categoryHref("sports", { after: "1.a", before: "2.b" }), "/category/sports?after=1.a");
  });

  it("builds links that parse back to the same query", () => {
    const after = encodeCursor("viewed", ROWS[7]);
    const url = new URL(categoryHref("world", { tag: "un", sort: "viewed", after }), "http://x");
    const query = parseCategoryQuery(Object.fromEntries(url.searchParams));
    assert.equal(query.tag, "un");
    assert.equal(query.sort, "viewed");
    assert.equal(query.cursor?.position.id, ROWS[7].id);
  });
});

describe("topTags", () => {
  it("keeps tags that recur, most frequent first, alphabetical among equals", () => {
    const lists = [["cricket", "psl", "babar azam"], ["cricket", "psl"], ["cricket", "hockey"], ["psl", "hockey"], ["one-off"]];
    assert.deepEqual(topTags(lists), [
      { tag: "cricket", count: 3 },
      { tag: "psl", count: 3 },
      { tag: "hockey", count: 2 },
    ]);
  });

  it("counts a tag once per story", () => {
    assert.deepEqual(topTags([["a b", "a b"], ["c d"]]), []);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 30 }, (_, i) => [`tag ${String(i).padStart(2, "0")}`]);
    assert.equal(topTags([...many, ...many]).length, 10);
    assert.equal(topTags([...many, ...many], { limit: 3 }).length, 3);
  });

  it("copes with no stories", () => {
    assert.deepEqual(topTags([]), []);
    assert.deepEqual(topTags([[], []]), []);
  });
});

describe("category metadata", () => {
  it("writes a distinct, sensible title and description for every category", () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const category of CATEGORIES) {
      const title = categoryTitle(category);
      const description = categoryDescription(category);
      titles.add(title);
      descriptions.add(description);
      assert.ok(`${title} | G12 News`.length <= 60, `${category.id} title too long for a search result: ${title}`);
      assert.ok(description.length >= 70 && description.length <= 160, `${category.id} description is ${description.length} characters`);
      assert.ok(title.includes(category.name) && description.includes(category.name));
    }
    assert.equal(titles.size, CATEGORIES.length);
    assert.equal(descriptions.size, CATEGORIES.length);
  });

  it("builds the Sports description around its tagline", () => {
    assert.equal(
      categoryDescription(CATEGORY_BY_ID.SPORTS),
      "Cricket, football, and every other game Pakistan follows. Latest Sports headlines on G12 News, updated as stories break.",
    );
  });

  it("titles a topic view with the topic", () => {
    assert.equal(categoryTitle(CATEGORY_BY_ID.SPORTS, "cricket"), "Cricket in Sports News");
    assert.equal(categoryTitle(CATEGORY_BY_ID.POLITICS, "imran khan"), "Imran Khan in Politics News");
  });

  it("names the plain category page as canonical for every variant of it", () => {
    const sports = CATEGORY_BY_ID.SPORTS;
    const cursor = encodeCursor("recent", ROWS[3]);
    for (const search of [{}, { tag: "cricket" }, { sort: "viewed" }, { after: cursor }, { tag: "psl", sort: "viewed" }]) {
      const meta = categoryMetadata(sports, parseCategoryQuery(search));
      assert.equal(meta.alternates?.canonical, "/category/sports", JSON.stringify(search));
      assert.equal(meta.description, categoryDescription(sports));
    }
  });

  it("leaves social tags to the site-wide defaults, so the shared image is kept", () => {
    // Setting openGraph here would replace the parent's (which carries app/opengraph-image.jpg) wholesale.
    const meta = categoryMetadata(CATEGORY_BY_ID.HEALTH, parseCategoryQuery({}));
    assert.equal(meta.title, "Health News: Latest Headlines");
    assert.equal(meta.openGraph, undefined);
    assert.equal(meta.twitter, undefined);
  });
});

describe("parseSiteUrl", () => {
  it("uses SITE_URL when it is an http(s) address", () => {
    assert.equal(parseSiteUrl("https://g12news.com").origin, "https://g12news.com");
    assert.equal(parseSiteUrl("  http://example.org  ").origin, "http://example.org");
  });

  it("falls back to the local address for anything else", () => {
    for (const bad of [undefined, "", "   ", "not a url", "ftp://example.com", "javascript:alert(1)"]) {
      assert.equal(parseSiteUrl(bad).origin, "http://localhost:3000", String(bad));
    }
  });
});
