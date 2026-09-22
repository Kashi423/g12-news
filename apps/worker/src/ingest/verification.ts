import { titleTokens, tokenSimilarity } from "./similarity";
import { wordCount } from "./text";

/**
 * Cross-source verification and claim validation for one story cluster.
 *
 * Both are deterministic token/number-overlap heuristics, not semantic entailment or a second AI
 * call: they catch the two things that matter most for a wire-style rewrite of RSS material (a
 * number that disagrees between outlets; a sentence with nothing behind it in the collected source
 * text), not subtle factual nuance. That trade-off is deliberate: requirement #15 (AI cost
 * optimization) asks for AI calls only on meaningful stories, so verification runs on text the
 * pipeline already has rather than spending another model call per claim.
 */

export type Agreement = "confirmed" | "single-source" | "conflicting";

export interface SourceText {
  sourceName: string;
  title: string;
  description: string;
}

export interface VerificationResult {
  sourceCount: number;
  agreement: Agreement;
  /** Plain-language notes on details that disagree between sources (a number near shared context). */
  conflicts: string[];
}

export type ClaimStatus = "supported" | "partially_supported" | "unsupported" | "conflicting" | "unverifiable";

export interface ClaimAssessment {
  text: string;
  status: ClaimStatus;
  /** How many of the cluster's sources contain matching wording for this claim. */
  corroboratingSources: number;
}

const NUMBER = /\b\d+(?:[.,]\d+)?\b/g;

function numbersIn(text: string): string[] {
  return [...text.matchAll(NUMBER)].map((m) => m[0]);
}

/** Splits a brief into sentence-level claims worth checking; short fragments are not worth judging. */
function claimSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => wordCount(s) >= 4);
}

/**
 * Compares the sources collected for a cluster. A single source can never be "confirmed" (there is
 * nothing to confirm it against) — it is reported internally as `single-source` until a second
 * outlet's report is attached. Two or more sources are `confirmed` unless a number-level conflict is
 * found near text both sources clearly share (so pagination noise cannot manufacture a conflict).
 */
export function crossSourceVerify(sources: SourceText[]): VerificationResult {
  const sourceCount = sources.length;
  if (sourceCount <= 1) return { sourceCount, agreement: "single-source", conflicts: [] };

  const conflicts: string[] = [];
  const byNumber = sources.map((s) => ({ name: s.sourceName, tokens: titleTokens(s.title), numbers: new Set(numbersIn(`${s.title} ${s.description}`)) }));
  for (let i = 0; i < byNumber.length; i++) {
    for (let j = i + 1; j < byNumber.length; j++) {
      const a = byNumber[i]!;
      const b = byNumber[j]!;
      if (tokenSimilarity(a.tokens, b.tokens) < 0.2) continue; // not clearly the same angle on the story
      const onlyA = [...a.numbers].filter((n) => !b.numbers.has(n));
      const onlyB = [...b.numbers].filter((n) => !a.numbers.has(n));
      if (onlyA.length > 0 && onlyB.length > 0) {
        conflicts.push(`${a.name} gives ${onlyA.slice(0, 2).join(", ")}; ${b.name} gives ${onlyB.slice(0, 2).join(", ")}`);
      }
    }
  }
  return { sourceCount, agreement: conflicts.length > 0 ? "conflicting" : "confirmed", conflicts: conflicts.slice(0, 5) };
}

/**
 * Classifies each sentence of the generated brief against the source material collected for its
 * cluster so far. "Supported" means the sentence's distinctive wording (and any number it states)
 * shows up in the source text; "conflicting" means it states a number the sources contradict;
 * anything with no matching source text is "unverifiable" rather than assumed false — the pipeline
 * cannot prove a negative from a short RSS snippet.
 */
export function validateClaims(summary: string, sources: SourceText[]): ClaimAssessment[] {
  const corpus = sources.map((s) => ({ tokens: titleTokens(`${s.title} ${s.description}`), numbers: numbersIn(`${s.title} ${s.description}`) }));
  return claimSentences(summary).map((text) => {
    const claimTokens = titleTokens(text);
    const claimNumbers = numbersIn(text);
    let corroborating = 0;
    let bestOverlap = 0;
    let numberConflict = false;
    for (const source of corpus) {
      const overlap = tokenSimilarity(claimTokens, source.tokens);
      bestOverlap = Math.max(bestOverlap, overlap);
      if (overlap < 0.25) continue;
      corroborating++;
      if (claimNumbers.length > 0 && source.numbers.length > 0 && claimNumbers.some((n) => !source.numbers.includes(n))) numberConflict = true;
    }
    let status: ClaimStatus;
    if (numberConflict) status = "conflicting";
    else if (corroborating >= 2) status = "supported";
    else if (corroborating === 1) status = sources.length > 1 ? "partially_supported" : "supported";
    else status = bestOverlap > 0 ? "unverifiable" : "unsupported";
    return { text, status, corroboratingSources: corroborating };
  });
}

/** True when enough claims failed validation that the story should not auto-publish. */
export function hasFailingClaims(claims: ClaimAssessment[]): boolean {
  if (claims.length === 0) return false;
  const failing = claims.filter((c) => c.status === "conflicting" || c.status === "unsupported").length;
  return failing / claims.length > 0.2;
}
