import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiUnavailableError } from "../ingest/types";
import type { AiBackend } from "./backend";
import { DEFAULT_ANTHROPIC_MODEL } from "./provider";
import { ResponseSchema } from "./schema";

export interface AnthropicBackendOptions {
  client?: Anthropic;
  model?: string;
}

/** Haiku models reject the `effort` parameter; the larger models accept it. */
function supportsEffort(model: string): boolean {
  return !/haiku/i.test(model);
}

/** Claude via the official SDK, with structured JSON output. Paid. */
export function createAnthropicBackend(options: AnthropicBackendOptions = {}): AiBackend {
  const client = options.client ?? new Anthropic({ maxRetries: 3, timeout: 90_000 });
  const model = options.model ?? (process.env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL);

  return {
    provider: "anthropic",
    label: model,
    maxDescriptionChars: 3000,
    async complete(system, user) {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 6000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { ...(supportsEffort(model) ? { effort: "low" as const } : {}), format: zodOutputFormat(ResponseSchema) },
        });
        const tokens = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
        if (response.stop_reason === "refusal") return { data: null, refused: true, ...tokens };
        return { data: response.parsed_output, ...tokens };
      } catch (error) {
        // A bad key, exhausted credit or rate limit hits every item alike: stop instead of failing them one by one.
        if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.RateLimitError) {
          throw new AiUnavailableError(`Anthropic API unavailable (${error.status}): ${error.message}`);
        }
        // Output that could not be parsed into the schema counts as an invalid draft, not an outage.
        if (!(error instanceof Anthropic.APIError)) return { data: null, inputTokens: 0, outputTokens: 0 };
        throw error;
      }
    },
  };
}
