import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeQualityScore } from "./quality";

const NOW = new Date("2026-09-21T12:00:00Z");

describe("computeQualityScore", () => {
  it("scores a fresh, well-corroborated, fully-supported story highly", () => {
    const result = computeQualityScore({
      sourceReliabilities: [4, 4],
      verification: { sourceCount: 2, agreement: "confirmed", conflicts: [] },
      claims: [{ text: "a", status: "supported", corroboratingSources: 2 }],
      summaryWordCount: 150,
      publishedAt: new Date(NOW.getTime() - 20 * 60_000),
      now: NOW,
      nearestSimilarity: 0,
    });
    assert.ok(result.score >= 85, `expected a high score, got ${result.score}`);
  });

  it("scores a single-source, unverifiable, thin, stale story lower", () => {
    const result = computeQualityScore({
      sourceReliabilities: [2],
      verification: { sourceCount: 1, agreement: "single-source", conflicts: [] },
      claims: [{ text: "a", status: "unverifiable", corroboratingSources: 0 }],
      summaryWordCount: 35,
      publishedAt: new Date(NOW.getTime() - 20 * 3_600_000),
      now: NOW,
      nearestSimilarity: 0.1,
    });
    assert.ok(result.score < 50, `expected a low score, got ${result.score}`);
  });

  it("penalizes a conflicting cluster and a near-duplicate headline", () => {
    const clean = computeQualityScore({
      sourceReliabilities: [3, 3],
      verification: { sourceCount: 2, agreement: "confirmed", conflicts: [] },
      claims: [],
      summaryWordCount: 150,
      publishedAt: NOW,
      now: NOW,
      nearestSimilarity: 0,
    });
    const conflicting = computeQualityScore({
      ...{
        sourceReliabilities: [3, 3],
        claims: [] as never[],
        summaryWordCount: 150,
        publishedAt: NOW,
        now: NOW,
      },
      verification: { sourceCount: 2, agreement: "conflicting" as const, conflicts: ["x"] },
      nearestSimilarity: 0.85,
    });
    assert.ok(conflicting.score < clean.score);
  });

  it("stays within 0-100 at the extremes", () => {
    const worst = computeQualityScore({
      sourceReliabilities: [1],
      verification: { sourceCount: 1, agreement: "single-source", conflicts: [] },
      claims: [
        { text: "a", status: "conflicting", corroboratingSources: 0 },
        { text: "b", status: "unsupported", corroboratingSources: 0 },
      ],
      summaryWordCount: 5,
      publishedAt: new Date(NOW.getTime() - 100 * 3_600_000),
      now: NOW,
      nearestSimilarity: 1,
    });
    assert.ok(worst.score >= 0 && worst.score <= 100);
  });
});
