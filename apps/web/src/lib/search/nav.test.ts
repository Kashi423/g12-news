import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseContactEmail } from "../contact";
import { COMPACT_AFTER_PX, EXPAND_BEFORE_PX, HERO_EXPAND_MARGIN_PX, nextCompact } from "../layout/compact";
import { isSearchable, normalizeQuery, SEARCH_MAX_CHARS, SEARCH_MAX_TERMS, searchTerms, toTsQuery } from "./query";

describe("normalizeQuery", () => {
  it("trims, collapses spaces and drops control characters", () => {
    assert.equal(normalizeQuery("  sri   lanka \n\t final "), "sri lanka final");
    assert.equal(normalizeQuery("a\u0000b\u0007c"), "a b c");
  });
  it("copes with missing input", () => {
    assert.equal(normalizeQuery(null), "");
    assert.equal(normalizeQuery(undefined), "");
    assert.equal(normalizeQuery(""), "");
  });
  it("caps the length", () => {
    const long = "word ".repeat(100);
    const out = normalizeQuery(long);
    assert.ok(out.length <= SEARCH_MAX_CHARS);
    assert.ok(!out.endsWith(" "));
  });
  it("folds compatibility characters (the AI's non-breaking hyphen, full-width letters)", () => {
    assert.equal(normalizeQuery("short\u2011range"), normalizeQuery("short\u2010range"));
    assert.equal(normalizeQuery("ＡＢＣ"), "ABC");
  });
});

describe("searchTerms", () => {
  it("returns lower-case words without repeats", () => {
    assert.deepEqual(searchTerms("Sri Lanka SRI final"), ["sri", "lanka", "final"]);
  });
  it("splits on punctuation and keeps digits", () => {
    assert.deepEqual(searchTerms("India-backed T20, 2026!"), ["india", "backed", "t20", "2026"]);
  });
  it("drops one-letter words", () => {
    assert.deepEqual(searchTerms("a b cricket"), ["cricket"]);
  });
  it("keeps words in other scripts (Urdu)", () => {
    assert.deepEqual(searchTerms("پاکستان کرکٹ"), ["پاکستان", "کرکٹ"]);
  });
  it("caps the number of words", () => {
    assert.equal(searchTerms("one two three four five six seven eight nine").length, SEARCH_MAX_TERMS);
  });
  it("removes every character that could mean something to the database", () => {
    const hostile = `'; DROP TABLE "Article"; -- & | ! ( ) : * \\ <-> ${"%"}`;
    for (const term of searchTerms(hostile)) assert.match(term, /^[\p{L}\p{N}]+$/u);
    assert.ok(!/[&|!():*'"\\<>;%-]/.test(toTsQuery(hostile).replace(/ & /g, " ").replace(/:\*/g, "")));
  });
});

describe("toTsQuery", () => {
  it("requires every word and lets each be a prefix", () => {
    assert.equal(toTsQuery("sri lanka"), "sri:* & lanka:*");
    assert.equal(toTsQuery("chama"), "chama:*");
  });
  it("is empty when there is nothing to search for", () => {
    assert.equal(toTsQuery(""), "");
    assert.equal(toTsQuery("a"), "");
    assert.equal(toTsQuery("!!! ---"), "");
  });
});

describe("isSearchable", () => {
  it("needs at least two characters and a real word", () => {
    assert.equal(isSearchable(""), false);
    assert.equal(isSearchable("a"), false);
    assert.equal(isSearchable("  a  "), false);
    assert.equal(isSearchable("!!"), false);
    assert.equal(isSearchable("ab"), true);
    assert.equal(isSearchable("  polio  "), true);
  });
});

describe("nextCompact (sticky header)", () => {
  const stackBottom = 129;
  it("with a hero: compacts once the hero has scrolled up under the header", () => {
    assert.equal(nextCompact(false, { scrollY: 0, heroBottom: 700, stackBottom }), false);
    assert.equal(nextCompact(false, { scrollY: 500, heroBottom: 200, stackBottom }), false);
    assert.equal(nextCompact(false, { scrollY: 600, heroBottom: stackBottom - 1, stackBottom }), true);
  });
  it("with a hero: expands again only after scrolling back a little (no flutter at the edge)", () => {
    assert.equal(nextCompact(true, { scrollY: 600, heroBottom: stackBottom + 10, stackBottom }), true);
    assert.equal(nextCompact(true, { scrollY: 500, heroBottom: stackBottom + HERO_EXPAND_MARGIN_PX + 1, stackBottom }), false);
  });
  it("without a hero: compacts after a short scroll and expands near the top", () => {
    assert.equal(nextCompact(false, { scrollY: COMPACT_AFTER_PX, heroBottom: null, stackBottom }), false);
    assert.equal(nextCompact(false, { scrollY: COMPACT_AFTER_PX + 1, heroBottom: null, stackBottom }), true);
    assert.equal(nextCompact(true, { scrollY: EXPAND_BEFORE_PX + 1, heroBottom: null, stackBottom }), true);
    assert.equal(nextCompact(true, { scrollY: EXPAND_BEFORE_PX, heroBottom: null, stackBottom }), false);
    assert.equal(nextCompact(true, { scrollY: 0, heroBottom: null, stackBottom }), false);
  });
});

describe("parseContactEmail", () => {
  it("accepts a plain address and trims it", () => {
    assert.equal(parseContactEmail("  desk@example.com "), "desk@example.com");
  });
  it("treats anything else as not set", () => {
    for (const bad of [undefined, "", "   ", "not an email", "a@b", "x@y.z w", "<a@b.co>", '"a"@b.co']) assert.equal(parseContactEmail(bad), null, String(bad));
  });
});
