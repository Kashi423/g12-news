import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { breakingReducer, initialState, LIVE_GRACE_MS, MAX_ITEMS, type BreakingState } from "./state";
import { formatSse } from "./sse";
import { relativeTime } from "./time";
import type { BreakingItem } from "./types";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const story = (id: string, minutes: number, title = `Story ${id}`): BreakingItem => ({
  id,
  slug: `story-${id}`,
  title,
  excerpt: "Excerpt.",
  category: "PAKISTAN",
  sourceName: "Dawn",
  publishedAt: minutesAgo(minutes),
  urgencyScore: 8,
});
const ids = (state: BreakingState) => state.items.map((i) => i.id);

describe("relativeTime", () => {
  const cases: [number, string][] = [
    [0, "just now"],
    [44, "just now"],
    [45, "1 minute ago"],
    [89, "1 minute ago"],
    [12 * 60, "12 minutes ago"],
    [12 * 60 + 20, "12 minutes ago"],
    [59 * 60, "59 minutes ago"],
    [3599, "1 hour ago"],
    [60 * 60, "1 hour ago"],
    [3 * 3600 + 900, "3 hours ago"],
    [24 * 3600, "1 day ago"],
    [50 * 3600, "2 days ago"],
  ];
  for (const [seconds, expected] of cases) {
    it(`${seconds}s -> "${expected}"`, () => assert.equal(relativeTime(new Date(NOW - seconds * 1000), NOW), expected));
  }

  it("never goes negative for a time slightly in the future, and ignores bad input", () => {
    assert.equal(relativeTime(NOW + 5000, NOW), "just now");
    assert.equal(relativeTime("nonsense", NOW), "");
  });
});

describe("formatSse", () => {
  it("writes an event frame with single-line JSON", () => {
    assert.equal(formatSse("breaking", { text: "line1\nline2" }), 'event: breaking\ndata: {"text":"line1\\nline2"}\n\n');
  });
});

describe("breaking state", () => {
  it("starts with fresh stories only, newest first, unique, capped", () => {
    const many = Array.from({ length: 12 }, (_, i) => story(`m${i}`, i + 1));
    const state = initialState([story("old", 6 * 60 + 1), story("a", 30), story("a", 30), story("b", 0), ...many], NOW);
    assert.equal(state.items.length, MAX_ITEMS);
    assert.equal(state.items[0]!.id, "b");
    assert.ok(!ids(state).includes("old"), "older than 6 hours is dropped");
    assert.equal(new Set(ids(state)).size, ids(state).length);
  });

  it("adds a pushed story to the top and marks it as having arrived live", () => {
    let state = initialState([story("a", 30)], NOW);
    state = breakingReducer(state, { type: "upsert", item: story("b", 1), now: NOW });
    assert.deepEqual(ids(state), ["b", "a"]);
    assert.deepEqual(state.liveIds, ["b"]);
    assert.equal(state.arrivedAt.b, NOW);
  });

  it("updates a story already shown without re-triggering its entrance", () => {
    let state = initialState([story("a", 30)], NOW);
    state = breakingReducer(state, { type: "upsert", item: story("a", 30, "Updated headline"), now: NOW });
    assert.equal(state.items[0]!.title, "Updated headline");
    assert.deepEqual(state.liveIds, []);
  });

  it("ignores a pushed story that is already past the window", () => {
    const state = initialState([story("a", 30)], NOW);
    assert.equal(breakingReducer(state, { type: "upsert", item: story("stale", 7 * 60), now: NOW }), state);
  });

  it("keeps only the newest when more than the cap arrive", () => {
    let state = initialState(Array.from({ length: MAX_ITEMS }, (_, i) => story(`s${i}`, 60 + i)), NOW);
    state = breakingReducer(state, { type: "upsert", item: story("newest", 1), now: NOW });
    assert.equal(state.items.length, MAX_ITEMS);
    assert.equal(state.items[0]!.id, "newest");
    assert.ok(!ids(state).includes(`s${MAX_ITEMS - 1}`), "the oldest fell off");
  });

  it("removes an un-flagged story", () => {
    let state = initialState([story("a", 30), story("b", 10)], NOW);
    state = breakingReducer(state, { type: "remove", id: "a" });
    assert.deepEqual(ids(state), ["b"]);
    assert.equal(breakingReducer(state, { type: "remove", id: "nope" }), state);
  });

  it("lets stories age out of the 6 hour window", () => {
    const state = initialState([story("a", 5 * 60 + 50), story("b", 10)], NOW);
    assert.equal(breakingReducer(state, { type: "expire", now: NOW + 5 * 60_000 }), state, "still inside the window: unchanged");
    const later = breakingReducer(state, { type: "expire", now: NOW + 11 * 60_000 });
    assert.deepEqual(ids(later), ["b"]);
    assert.equal(breakingReducer(later, { type: "expire", now: NOW + 12 * 60_000 }), later, "no change returns the same object");
  });

  it("replaces the list from a snapshot, dropping stories the server no longer lists", () => {
    const state = initialState([story("a", 30), story("b", 20)], NOW);
    const next = breakingReducer(state, { type: "snapshot", items: [story("b", 20), story("c", 2)], now: NOW });
    assert.deepEqual(ids(next), ["c", "b"]);
  });

  it("protects a story that arrived live moments ago from a stale snapshot, but not for long", () => {
    let state = initialState([story("a", 30)], NOW);
    state = breakingReducer(state, { type: "upsert", item: story("fresh", 1), now: NOW });

    const stale = breakingReducer(state, { type: "snapshot", items: [story("a", 30)], now: NOW + 3_000 });
    assert.deepEqual(ids(stale), ["fresh", "a"], "kept: the poll may pre-date it");

    const later = breakingReducer(state, { type: "snapshot", items: [story("a", 30)], now: NOW + LIVE_GRACE_MS + 1_000 });
    assert.deepEqual(ids(later), ["a"], "after the grace period the server's list wins");
  });
});
