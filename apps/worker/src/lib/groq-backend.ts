import { createSerializer } from "../ingest/pool";
import { AiUnavailableError } from "../ingest/types";
import type { AiBackend, BackendReply } from "./backend";
import { DEFAULT_GROQ_MODELS } from "./provider";
import { responseJsonSchema } from "./schema";

/**
 * Groq's OpenAI-compatible API on the FREE plan (a free key, no card). The free plan is tight:
 * every model has its own small per-minute and per-day token budget, so this backend
 *  - uses the models in order (best first) and moves to the next one when a model is rate-limited;
 *  - treats a 429 asking for a short wait as a per-minute limit (waits, or uses another model) and
 *    one asking for a long wait as the daily budget being spent (that model is skipped for now);
 *  - throws AiUnavailableError once every model is out of budget, so the pipeline defers the rest
 *    of the run instead of failing item by item;
 *  - sends requests one at a time, and paces itself from Groq's rate-limit headers.
 */

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
/** A 429 asking for at most this long is a per-minute limit; longer means the daily budget is gone. */
const SHORT_WAIT_SECONDS = 90;
/** Below this many tokens left in the minute, wait for the window to reset before the next request (~1 request). */
const LOW_TOKEN_MARK = 3500;
const MAX_TRIES = 10;

interface ModelState {
  name: string;
  /** Epoch ms before which this model should not be used. */
  blockedUntil: number;
  /** Request format: 0 = strict JSON schema + reasoning options, 1 = strict schema, 2 = plain JSON mode. */
  variant: 0 | 1 | 2;
}

type Attempt =
  | { kind: "done"; reply: BackendReply }
  | { kind: "retry"; reason: string; pauseMs?: number }
  | { kind: "fatal"; error: Error };

export interface GroqBackendOptions {
  apiKey: string;
  models?: string[];
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
}

/** "1m26.4s", "7.66s", "120ms", "2h3m" or plain seconds -> seconds. */
export function parseDurationSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  let total = 0;
  let matched = false;
  for (const m of value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "ms" ? n / 1000 : m[2] === "s" ? n : m[2] === "m" ? n * 60 : n * 3600;
  }
  if (matched) return total;
  const plain = Number(value);
  return Number.isFinite(plain) ? plain : null;
}

/** Parse a model's reply as JSON, tolerating code fences and stray prose around the object. */
export function parseJsonLoose(content: string): unknown {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function createGroqBackend(options: GroqBackendOptions): AiBackend {
  const models = options.models?.length ? options.models : DEFAULT_GROQ_MODELS;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const states: ModelState[] = models.map((name) => ({ name, blockedUntil: 0, variant: 0 }));
  const schema = responseJsonSchema();
  const schemaHint = `Reply with ONLY one JSON object that matches this JSON Schema (no prose, no code fences): ${JSON.stringify(schema)}`;
  const serialize = createSerializer();

  /** The first model that is free to use; waits out short blocks, throws when every model is out of budget. */
  async function pickModel(): Promise<ModelState> {
    for (;;) {
      const t = now();
      const ready = states.find((s) => s.blockedUntil <= t);
      if (ready) return ready;
      const waitMs = Math.min(...states.map((s) => s.blockedUntil)) - t;
      if (waitMs > SHORT_WAIT_SECONDS * 1000) {
        throw new AiUnavailableError(
          `Groq free-tier budget is used up on every model (${models.join(", ")}); the earliest reset is in about ${Math.ceil(waitMs / 60_000)} minute(s)`,
        );
      }
      await sleep(waitMs + 250);
    }
  }

  function buildBody(state: ModelState, system: string, user: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: state.name,
      temperature: 0.3,
      max_completion_tokens: 3500,
      messages: [
        { role: "system", content: state.variant === 2 ? `${system}\n\n${schemaHint}` : system },
        { role: "user", content: user },
      ],
      response_format: state.variant === 2 ? { type: "json_object" } : { type: "json_schema", json_schema: { name: "news_brief", strict: true, schema } },
    };
    // gpt-oss models are reasoning models; keep their hidden reasoning short so it does not eat the token budget.
    if (state.variant === 0 && /gpt-oss/i.test(state.name)) {
      body.reasoning_effort = "low";
      body.include_reasoning = false;
    }
    return body;
  }

  async function attempt(state: ModelState, system: string, user: string): Promise<Attempt> {
    let response: Response;
    try {
      response = await doFetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(buildBody(state, system, user)),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { kind: "retry", reason: `network error: ${error instanceof Error ? error.message : error}`, pauseMs: 1500 };
    }

    if (response.status === 200) {
      const body = (await response.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const choice = body.choices?.[0];
      const truncated = choice?.finish_reason === "length";
      const reply: BackendReply = {
        data: truncated ? null : parseJsonLoose(choice?.message?.content ?? ""),
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
      // Pace from the headers: little left this minute -> let the window reset; no requests left today -> stop using this model.
      const tokensLeft = Number(response.headers.get("x-ratelimit-remaining-tokens"));
      const tokensReset = parseDurationSeconds(response.headers.get("x-ratelimit-reset-tokens"));
      if (Number.isFinite(tokensLeft) && tokensLeft < LOW_TOKEN_MARK && tokensReset !== null) {
        state.blockedUntil = Math.max(state.blockedUntil, now() + Math.min(tokensReset, 65) * 1000);
      }
      const requestsLeft = response.headers.get("x-ratelimit-remaining-requests");
      const requestsReset = parseDurationSeconds(response.headers.get("x-ratelimit-reset-requests"));
      if (requestsLeft !== null && Number(requestsLeft) <= 0 && requestsReset !== null) {
        state.blockedUntil = Math.max(state.blockedUntil, now() + requestsReset * 1000);
      }
      return { kind: "done", reply };
    }

    const text = await response.text().catch(() => "");
    let detail: { message?: string; code?: string } = {};
    try {
      detail = (JSON.parse(text) as { error?: { message?: string; code?: string } }).error ?? {};
    } catch {
      // not JSON
    }
    const message = detail.message ?? text.slice(0, 120);

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 20;
      state.blockedUntil = now() + Math.min(seconds, 86_400) * 1000;
      return { kind: "retry", reason: `rate limited on ${state.name} (retry in ${Math.round(seconds)}s)` };
    }
    if (response.status === 401 || response.status === 403) {
      return { kind: "fatal", error: new AiUnavailableError(`Groq rejected the API key (HTTP ${response.status}); check GROQ_API_KEY`) };
    }
    if (response.status === 404 || (response.status === 400 && /model.*(not found|decommissioned|does not exist|not supported)/i.test(message))) {
      state.blockedUntil = now() + 86_400_000; // model gone or not available on this plan: skip it
      return { kind: "retry", reason: `model ${state.name} unavailable: ${message}` };
    }
    if (response.status === 400) {
      // The model produced JSON that failed the schema: an invalid draft, which the caller retries with feedback.
      if (detail.code === "json_validate_failed" || /json_validate|failed to generate json|failed_generation/i.test(text)) {
        return { kind: "done", reply: { data: null, inputTokens: 0, outputTokens: 0 } };
      }
      // Otherwise the request format is not accepted by this model: step down to a simpler one.
      if (state.variant < 2) {
        state.variant = (state.variant + 1) as ModelState["variant"];
        return { kind: "retry", reason: `${state.name} rejected the request format (${message}); trying a simpler one` };
      }
      return { kind: "fatal", error: new Error(`Groq HTTP 400: ${message}`) };
    }
    if (response.status >= 500 || response.status === 408) {
      return { kind: "retry", reason: `Groq HTTP ${response.status}`, pauseMs: 2000 };
    }
    return { kind: "fatal", error: new Error(`Groq HTTP ${response.status}: ${message}`) };
  }

  return {
    provider: "groq",
    label: models.join(", "),
    maxDescriptionChars: 1800,
    complete(system, user) {
      return serialize(async () => {
        let lastReason = "no attempt made";
        for (let tries = 0; tries < MAX_TRIES; tries++) {
          const state = await pickModel();
          const result = await attempt(state, system, user);
          if (result.kind === "done") return result.reply;
          if (result.kind === "fatal") throw result.error;
          lastReason = result.reason;
          if (result.pauseMs) await sleep(result.pauseMs);
        }
        throw new Error(`Groq request failed after ${MAX_TRIES} attempts: ${lastReason}`);
      });
    },
  };
}
