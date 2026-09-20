/** Words in a headline that signal a time-critical story. */
const URGENT_KEYWORDS =
  /\b(breaking|dead|dies|died|death toll|killed|explosion|blast|attack|resigns?|resigned|arrested|earthquake|flood|wins?|won|crash|shooting|hostage|ceasefire|emergency)\b/i;

const HOUR = 3_600_000;

/**
 * Final 0-10 urgency: the model's score, adjusted by two things it cannot see reliably.
 *  - Staleness caps the score, so an old story is never flagged as breaking.
 *  - A fresh story (< 1h) with an urgent keyword in the headline gets +1.
 */
export function finalUrgency(modelScore: number, publishedAt: Date, now: Date, headline: string): number {
  let score = Number.isFinite(modelScore) ? Math.round(modelScore) : 0;
  const ageMs = Math.max(0, now.getTime() - publishedAt.getTime());
  if (ageMs > 24 * HOUR) score = Math.min(score, 3);
  else if (ageMs > 6 * HOUR) score = Math.min(score, 5);
  else if (ageMs <= HOUR && URGENT_KEYWORDS.test(headline)) score += 1;
  return Math.min(10, Math.max(0, score));
}
