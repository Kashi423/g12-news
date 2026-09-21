import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articlePath,
  breakingCutoff,
  breakingFallbackCutoff,
  BREAKING_FALLBACK_MAX_AGE_MS,
  BREAKING_MAX_AGE_MS,
  isCurrentlyBreaking,
} from "./breaking";

const NOW = new Date("2026-09-21T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("isCurrentlyBreaking", () => {
  it("is true for a flagged story published within the last 6 hours", () => {
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: hoursAgo(0.2) }, NOW), true);
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: hoursAgo(5.9) }, NOW), true);
  });

  it("is exactly inclusive at the 6 hour boundary and false just past it", () => {
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: hoursAgo(6) }, NOW), true);
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: new Date(hoursAgo(6).getTime() - 1) }, NOW), false);
  });

  it("is false when the flag is off, however fresh", () => {
    assert.equal(isCurrentlyBreaking({ isBreaking: false, publishedAt: hoursAgo(0.1) }, NOW), false);
  });

  it("accepts ISO strings and timestamps, and rejects unparseable dates", () => {
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: hoursAgo(1).toISOString() }, NOW), true);
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: hoursAgo(1).getTime() }, NOW.getTime()), true);
    assert.equal(isCurrentlyBreaking({ isBreaking: true, publishedAt: "not a date" }, NOW), false);
  });

  it("computes the cutoff from a Date or a timestamp", () => {
    assert.equal(breakingCutoff(NOW).getTime(), NOW.getTime() - BREAKING_MAX_AGE_MS);
    assert.equal(breakingCutoff(NOW.getTime()).getTime(), NOW.getTime() - BREAKING_MAX_AGE_MS);
  });
});

describe("breakingFallbackCutoff", () => {
  it("computes the 3 hour top-up cutoff from a Date or a timestamp", () => {
    assert.equal(breakingFallbackCutoff(NOW).getTime(), NOW.getTime() - BREAKING_FALLBACK_MAX_AGE_MS);
    assert.equal(breakingFallbackCutoff(NOW.getTime()).getTime(), NOW.getTime() - BREAKING_FALLBACK_MAX_AGE_MS);
  });
});

describe("articlePath", () => {
  it("builds the article URL", () => {
    assert.equal(articlePath("pm-meets-saudi-crown-prince"), "/article/pm-meets-saudi-crown-prince");
  });
});
