import type { ClaimAssessment, VerificationResult } from "./verification";

/**
 * An internal editorial automation signal, 0-100, combining every factor requirement #8 lists.
 * Never shown to readers (see Article.qualityScore's schema comment): it exists only to route
 * uncertain stories to /admin instead of publishing them outright.
 */
export interface QualityInput {
  sourceReliabilities: number[]; // 1-5 each, one per source in the cluster (Source.reliability)
  verification: VerificationResult;
  claims: ClaimAssessment[];
  summaryWordCount: number;
  publishedAt: Date;
  now: Date;
  /** The strongest title-similarity score seen against another recent headline, 0-1. */
  nearestSimilarity: number;
}

export interface QualityResult {
  score: number;
  breakdown: { sources: number; reliability: number; agreement: number; claims: number; completeness: number; freshness: number; duplicateRisk: number };
}

function sourcesPoints(count: number): number {
  return Math.min(25, 12 + Math.max(0, count - 1) * 8);
}

function reliabilityPoints(reliabilities: number[]): number {
  if (reliabilities.length === 0) return 9; // neutral default, matches the middle of the 1-5 scale
  const avg = reliabilities.reduce((a, b) => a + b, 0) / reliabilities.length;
  return Math.round((avg / 5) * 15);
}

function agreementPoints(agreement: VerificationResult["agreement"]): number {
  return agreement === "confirmed" ? 20 : agreement === "single-source" ? 10 : 0;
}

function claimsPoints(claims: ClaimAssessment[]): number {
  if (claims.length === 0) return 10; // nothing to check against is treated as neutral, not a failure
  const weight = { supported: 1, partially_supported: 0.6, unverifiable: 0.35, unsupported: 0, conflicting: 0 } as const;
  const total = claims.reduce((sum, c) => sum + weight[c.status], 0);
  return Math.round((total / claims.length) * 20);
}

function completenessPoints(words: number): number {
  if (words >= 100) return 10;
  if (words <= 30) return 2;
  return Math.round(2 + ((words - 30) / 70) * 8);
}

function freshnessPoints(publishedAt: Date, now: Date): number {
  const hours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000);
  if (hours <= 1) return 10;
  if (hours >= 24) return 0;
  return Math.round(10 * (1 - hours / 24));
}

function duplicateRiskPenalty(nearestSimilarity: number): number {
  // Below the AI's own "worth asking about" threshold this is not a risk at all; above it, the
  // closer to an auto-drop the AI still chose to publish, the more a human should sanity-check it.
  return Math.round(Math.max(0, nearestSimilarity - 0.5) * 20);
}

export function computeQualityScore(input: QualityInput): QualityResult {
  const breakdown = {
    sources: sourcesPoints(input.verification.sourceCount),
    reliability: reliabilityPoints(input.sourceReliabilities),
    agreement: agreementPoints(input.verification.agreement),
    claims: claimsPoints(input.claims),
    completeness: completenessPoints(input.summaryWordCount),
    freshness: freshnessPoints(input.publishedAt, input.now),
    duplicateRisk: -duplicateRiskPenalty(input.nearestSimilarity),
  };
  const raw = breakdown.sources + breakdown.reliability + breakdown.agreement + breakdown.claims + breakdown.completeness + breakdown.freshness + breakdown.duplicateRisk;
  return { score: Math.max(0, Math.min(100, Math.round(raw))), breakdown };
}
