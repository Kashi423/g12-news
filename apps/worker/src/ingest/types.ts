import type { CategoryId } from "@g12/config";

/** Why an item was not published. "duplicate" comes from title matching; the rest from the AI. */
export type RejectReason =
  | "advertisement"
  | "press_release"
  | "low_quality"
  | "uncategorizable"
  | "not_relevant"
  | "insufficient_content"
  | "model_refusal"
  | "duplicate";

/** What the pipeline sends to the AI for one feed item. */
export interface AnalyzeInput {
  title: string;
  /** RSS description / content, plain text. */
  description: string;
  sourceName: string;
  /** The feed's default category (hint only). */
  feedCategory: CategoryId;
  /** World/wire feeds: only Pakistan-relevant or major stories may be published. */
  internationalFeed: boolean;
  publishedAt: Date;
  now: Date;
  /** Earlier headlines that look similar, for the AI to confirm or dismiss as the same story. */
  similar: { id: number; title: string }[];
}

export type AnalysisOutcome =
  | {
      kind: "publish";
      headline: string;
      excerpt: string;
      /** The original 120-220 word brief (becomes Article.body). */
      summary: string;
      category: CategoryId;
      tags: string[];
      slug: string;
      /** Raw model score, 0-10; the pipeline adjusts it (see urgency.ts). */
      urgencyScore: number;
    }
  | { kind: "reject"; reason: RejectReason; note?: string }
  | { kind: "duplicate"; ofId: number };

export type Analyzer = (input: AnalyzeInput) => Promise<AnalysisOutcome>;

/**
 * The AI service cannot be used right now for a reason that affects every item, not just one:
 * a spent free-tier budget, a rejected API key, exhausted credit. The pipeline stops calling the
 * AI for the rest of the run and defers the remaining items to the next one.
 */
export class AiUnavailableError extends Error {}
