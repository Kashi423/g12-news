import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSocialLinks } from "../social";
import { hostMatches, isOptimizableImage, normalizeImageUrl } from "../images";
import { formatToday } from "./dates";
import { pickFeatured, sectionArticles, sectionDisplayCount } from "./ranking";
import type { HomeArticle } from "./types";

const NOW = Date.parse("2026-09-21T12:00:00Z");
let n = 0;
const story = (over: Partial<HomeArticle> & { minutesAgo?: number } = {}): HomeArticle => {
  const { minutesAgo = 10, ...rest } = over;
  n++;
  return {
    id: `a${n}`,
    slug: `story-${n}`,
    title: `Story ${n}`,
    excerpt: "Excerpt.",
    imageUrl: null,
    category: "PAKISTAN",
    tags: [],
    sourceName: "Dawn",
    publishedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    urgencyScore: 3,
    isBreaking: false,
    ...rest,
  };
};
const ids = (list: HomeArticle[]) => list.map((a) => a.id);

describe("pickFeatured", () => {
  it("makes the most recent high-urgency story the hero, even if newer low-urgency stories exist", () => {
    const newestLow = story({ minutesAgo: 1, urgencyScore: 2 });
    const oldHigh = story({ minutesAgo: 90, urgencyScore: 7 });
    const newerHigh = story({ minutesAgo: 30, urgencyScore: 6 });
    const { hero } = pickFeatured([newestLow, oldHigh, newerHigh]);
    assert.equal(hero?.id, newerHigh.id);
  });

  it("fills the side stories with the next high-urgency stories first, then the most recent of the rest", () => {
    const hero = story({ minutesAgo: 5, urgencyScore: 9 });
    const high1 = story({ minutesAgo: 60, urgencyScore: 8 });
    const high2 = story({ minutesAgo: 120, urgencyScore: 6 });
    const lowNew = story({ minutesAgo: 2, urgencyScore: 3 });
    const lowOld = story({ minutesAgo: 300, urgencyScore: 1 });
    const { secondary } = pickFeatured([lowOld, hero, lowNew, high2, high1]);
    assert.deepEqual(ids(secondary), [high1.id, high2.id, lowNew.id]);
  });

  it("falls back to the most recent story when nothing is high-urgency", () => {
    const newest = story({ minutesAgo: 3, urgencyScore: 2 });
    const older = story({ minutesAgo: 30, urgencyScore: 5 });
    const { hero, secondary } = pickFeatured([older, newest]);
    assert.equal(hero?.id, newest.id);
    assert.deepEqual(ids(secondary), [older.id]);
  });

  it("copes with an empty or tiny pool", () => {
    assert.deepEqual(pickFeatured([]), { hero: null, secondary: [] });
    const only = story();
    assert.deepEqual(pickFeatured([only]), { hero: only, secondary: [] });
  });
});

describe("sectionArticles", () => {
  it("skips featured stories, orders newest first, and caps at 6", () => {
    const list = Array.from({ length: 9 }, (_, i) => story({ minutesAgo: i + 1 }));
    const result = sectionArticles("PAKISTAN", list, new Set([list[0]!.id]));
    assert.equal(result.length, 6);
    assert.equal(result[0]!.id, list[1]!.id);
    assert.ok(!ids(result).includes(list[0]!.id));
  });

  it("puts cricket first in Sports, keeping newest-first within each group", () => {
    const football = story({ category: "SPORTS", minutesAgo: 2, tags: ["football"] });
    const cricketOld = story({ category: "SPORTS", minutesAgo: 200, tags: ["cricket", "psl"] });
    const cricketNew = story({ category: "SPORTS", minutesAgo: 50, tags: ["cricket"] });
    const hockey = story({ category: "SPORTS", minutesAgo: 10, tags: ["hockey"] });
    assert.deepEqual(ids(sectionArticles("SPORTS", [football, cricketOld, hockey, cricketNew], new Set())), [cricketNew.id, cricketOld.id, football.id, hockey.id]);
  });

  it("does not reorder categories that have no priority tag", () => {
    const a = story({ tags: ["cricket"], minutesAgo: 30 });
    const b = story({ tags: [], minutesAgo: 5 });
    assert.deepEqual(ids(sectionArticles("HEALTH", [a, b], new Set())), [b.id, a.id]);
  });
});

describe("sectionDisplayCount", () => {
  it("shows up to 6, a tidy 4 for 4 or 5, and whatever exists below that", () => {
    assert.deepEqual([0, 1, 3, 4, 5, 6, 9].map(sectionDisplayCount), [0, 1, 3, 4, 4, 6, 6]);
  });
});

describe("images", () => {
  it("matches exact hosts and **. wildcards, case-insensitively", () => {
    assert.equal(hostMatches("i.dawn.com", "i.dawn.com"), true);
    assert.equal(hostMatches("I.Dawn.com", "i.dawn.com"), true);
    assert.equal(hostMatches("evil.i.dawn.com", "i.dawn.com"), false);
    assert.equal(hostMatches("img.dawn.com", "**.dawn.com"), true);
    assert.equal(hostMatches("a.b.dawn.com", "**.dawn.com"), true);
    assert.equal(hostMatches("dawn.com", "**.dawn.com"), false);
    assert.equal(hostMatches("notdawn.com", "**.dawn.com"), false);
  });

  it("optimizes only https images from allowlisted hosts", () => {
    assert.equal(isOptimizableImage("https://i.dawn.com/large/2026/09/x.webp"), true);
    assert.equal(isOptimizableImage("https://p.imgci.com/db/PICTURES/1.jpg"), true);
    assert.equal(isOptimizableImage("https://random-cdn.example/x.jpg"), false);
    assert.equal(isOptimizableImage("http://i.dawn.com/x.jpg"), false);
    assert.equal(isOptimizableImage("not a url"), false);
  });

  it("normalizes feed image URLs: https only, sharper BBC thumbnails, junk rejected", () => {
    assert.equal(normalizeImageUrl("http://p.imgci.com/db/PICTURES/CMS/420500/420523.jpg"), "https://p.imgci.com/db/PICTURES/CMS/420500/420523.jpg");
    assert.equal(normalizeImageUrl("https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/78b8/live/x.jpg"), "https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/78b8/live/x.jpg");
    assert.equal(normalizeImageUrl("https://i.dawn.com/large/x.webp?w=1"), "https://i.dawn.com/large/x.webp?w=1");
    assert.equal(normalizeImageUrl("javascript:alert(1)"), null);
    assert.equal(normalizeImageUrl("data:image/png;base64,AAAA"), null);
    assert.equal(normalizeImageUrl(""), null);
    assert.equal(normalizeImageUrl(null), null);
  });
});

describe("formatToday", () => {
  it("formats the date in Pakistan time, not UTC", () => {
    // 22:30 UTC on 20 Sep is already 03:30 on 21 Sep in Karachi (UTC+5)
    const t = formatToday(new Date("2026-09-20T22:30:00Z"));
    // (the comma after the weekday and "Sep"/"Sept" vary with the ICU version, so match loosely)
    assert.match(t.long, /^Monday,? 21 September 2026$/);
    assert.match(t.short, /^Mon,? 21 Sept? 2026$/);
    assert.equal(t.iso, "2026-09-21");
  });
});

describe("social links", () => {
  it("uses configured URLs and falls back to the networks' home pages", () => {
    const defaults = getSocialLinks({});
    assert.deepEqual(defaults.map((l) => l.id), ["facebook", "x", "whatsapp"]);
    assert.ok(defaults.every((l) => l.href.startsWith("https://")));
    const custom = getSocialLinks({ NEXT_PUBLIC_X_URL: "https://x.com/g12news" });
    assert.equal(custom.find((l) => l.id === "x")!.href, "https://x.com/g12news");
    assert.equal(custom.find((l) => l.id === "facebook")!.href, defaults[0]!.href);
  });
});
