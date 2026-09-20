import { z } from "zod";
import { CATEGORY_IDS } from "@g12/config";

export const AI_REJECT_REASONS = ["advertisement", "press_release", "low_quality", "uncategorizable", "not_relevant", "insufficient_content"] as const;

/**
 * The JSON the model must return. Deliberately flat, with no nullable fields (a sentinel value is
 * used instead: rejectReason "none", duplicateOfId 0), so that any provider's strict
 * constrained-decoding mode accepts the schema.
 */
export const ResponseSchema = z.object({
  decision: z.enum(["publish", "reject"]),
  rejectReason: z.enum([...AI_REJECT_REASONS, "none"] as const),
  duplicateOfId: z.number().int(),
  category: z.enum(CATEGORY_IDS),
  categoryConfidence: z.number(),
  headline: z.string(),
  excerpt: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  slug: z.string(),
  urgencyScore: z.number().int(),
});

export type RawAnalysis = z.infer<typeof ResponseSchema>;

/** Plain JSON Schema for providers that take one directly (OpenAI-compatible APIs). */
export function responseJsonSchema(): Record<string, unknown> {
  const { $schema: _draft, ...schema } = z.toJSONSchema(ResponseSchema) as Record<string, unknown>;
  return schema;
}
