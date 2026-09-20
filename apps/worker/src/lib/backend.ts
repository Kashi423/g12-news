/** What `ai.ts` needs from an AI provider: send a system + user prompt, get JSON back. */
export interface BackendReply {
  /** The model's JSON object, not yet validated (null if it was not valid JSON). */
  data: unknown;
  /** The provider declined to answer for safety reasons. */
  refused?: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface AiBackend {
  readonly provider: "anthropic" | "groq";
  /** Human-readable model name(s) for logs. */
  readonly label: string;
  /** How much of the feed description to include in the prompt (saves tokens on small quotas). */
  readonly maxDescriptionChars: number;
  /** Throws AiUnavailableError when the service cannot be used at all right now. */
  complete(system: string, user: string): Promise<BackendReply>;
}
