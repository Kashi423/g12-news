import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { loadSettings } from "../settings";
import { AiUnavailableError, type AnalyzeInput } from "../ingest/types";
import { createAnalyzer } from "./ai";
import { createGroqBackend, parseDurationSeconds, parseJsonLoose } from "./groq-backend";
import { aiConfigProblems, aiLabel, groqModels, resolveProvider } from "./provider";

const filler = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
const brief = (over: Record<string, unknown> = {}) => ({
  decision: "publish",
  rejectReason: "none",
  duplicateOfId: 0,
  category: "PAKISTAN",
  categoryConfidence: 0.9,
  headline: "Monsoon downpour floods Lahore roads",
  excerpt: "Heavy rain caused flooding across Lahore.",
  summary: filler(130, "out"),
  tags: ["lahore", "rain", "flooding"],
  slug: "monsoon-downpour-floods-lahore-roads",
  urgencyScore: 6,
  ...over,
});
const input: AnalyzeInput = {
  title: "Heavy rain lashes Lahore, roads flooded",
  description: `Heavy rain lashed Lahore on Saturday morning. ${filler(80, "src")}`,
  sourceName: "Dawn",
  feedCategory: "PAKISTAN",
  internationalFeed: false,
  publishedAt: new Date("2026-09-20T08:00:00Z"),
  now: new Date("2026-09-20T08:30:00Z"),
  similar: [],
};

interface Reply {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}
const ok = (json: unknown, headers: Record<string, string> = {}, finish = "stop"): Reply => ({
  status: 200,
  headers,
  body: { choices: [{ message: { content: typeof json === "string" ? json : JSON.stringify(json) }, finish_reason: finish }], usage: { prompt_tokens: 900, completion_tokens: 300 } },
});
const rateLimited = (seconds: number): Reply => ({ status: 429, headers: { "retry-after": String(seconds) }, body: { error: { message: "Rate limit reached", type: "tokens" } } });
const failure = (status: number, message: string, code?: string): Reply => ({ status, body: { error: { message, code } } });

describe("parseDurationSeconds / parseJsonLoose", () => {
  it("parses Groq-style durations", () => {
    assert.equal(parseDurationSeconds("1m26.4s"), 86.4);
    assert.equal(parseDurationSeconds("7.66s"), 7.66);
    assert.equal(parseDurationSeconds("120ms"), 0.12);
    assert.equal(parseDurationSeconds("2h3m"), 7380);
    assert.equal(parseDurationSeconds("45"), 45);
    assert.equal(parseDurationSeconds(null), null);
    assert.equal(parseDurationSeconds("soon"), null);
  });

  it("parses JSON wrapped in code fences or prose, and returns null for junk", () => {
    assert.deepEqual(parseJsonLoose('{"a":1}'), { a: 1 });
    assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonLoose('Here you go: {"a":1} hope that helps'), { a: 1 });
    assert.equal(parseJsonLoose("not json"), null);
    assert.equal(parseJsonLoose('{"a":'), null);
  });
});

describe("Groq backend (against a scripted local server)", () => {
  let server: Server;
  let baseUrl: string;
  let script: Reply[] = [];
  let delayMs = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const requests: { url?: string; headers: Record<string, unknown>; body: any }[] = [];

  // A fake clock: sleeping just advances time, so rate-limit waits cost nothing.
  let t = 1_000_000;
  const sleeps: number[] = [];
  const backend = (models: string[] = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) =>
    createGroqBackend({
      apiKey: "gsk_test",
      models,
      baseUrl,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });

  before(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        const next = script.shift() ?? { status: 500, body: { error: { message: "script exhausted" } } };
        inFlight--;
        res.writeHead(next.status, { "content-type": "application/json", ...next.headers }).end(JSON.stringify(next.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/openai/v1`;
  });
  after(() => server.close());
  beforeEach(() => {
    script = [];
    requests.length = 0;
    sleeps.length = 0;
    delayMs = 0;
    inFlight = maxInFlight = 0;
    t = 1_000_000;
  });

  it("sends an OpenAI-style request with a strict JSON schema and low reasoning effort", async () => {
    script = [ok(brief())];
    const reply = await backend().complete("SYSTEM", "USER");

    const { url, headers, body } = requests[0]!;
    assert.equal(url, "/openai/v1/chat/completions");
    assert.equal(headers.authorization, "Bearer gsk_test");
    assert.equal(body.model, "openai/gpt-oss-120b");
    assert.deepEqual(body.messages, [{ role: "system", content: "SYSTEM" }, { role: "user", content: "USER" }]);
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    const schema = body.response_format.json_schema.schema;
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.includes("summary") && schema.required.includes("category"));
    assert.ok(!("$schema" in schema));
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.include_reasoning, false);
    assert.deepEqual([reply.inputTokens, reply.outputTokens], [900, 300]);
    assert.equal((reply.data as { headline: string }).headline, "Monsoon downpour floods Lahore roads");
  });

  it("does not send reasoning options to models that are not gpt-oss", async () => {
    script = [ok(brief())];
    await backend(["qwen/some-model"]).complete("S", "U");
    assert.equal(requests[0]!.body.reasoning_effort, undefined);
    assert.equal(requests[0]!.body.include_reasoning, undefined);
  });

  it("moves to the next model when one is rate-limited for a short time, without waiting", async () => {
    script = [rateLimited(10), ok(brief())];
    await backend().complete("S", "U");
    assert.deepEqual(requests.map((r) => r.body.model), ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    assert.deepEqual(sleeps, []);
  });

  it("waits out a per-minute limit when it is the only model, then retries it", async () => {
    script = [rateLimited(20), ok(brief())];
    await backend(["openai/gpt-oss-120b"]).complete("S", "U");
    assert.deepEqual(sleeps, [20_250]);
    assert.deepEqual(requests.map((r) => r.body.model), ["openai/gpt-oss-120b", "openai/gpt-oss-120b"]);
  });

  it("reports AiUnavailableError once every model has spent its daily budget, and stops asking", async () => {
    script = [rateLimited(7200), rateLimited(7200)];
    const b = backend();
    await assert.rejects(b.complete("S", "U"), (e: unknown) => e instanceof AiUnavailableError && /used up on every model/.test(e.message));
    assert.equal(requests.length, 2);

    await assert.rejects(b.complete("S", "U"), AiUnavailableError);
    assert.equal(requests.length, 2, "no further requests while the models are known to be exhausted");

    t += 7200_000 + 1000; // the budget resets
    script = [ok(brief())];
    await b.complete("S", "U");
    assert.equal(requests.length, 3);
  });

  it("steps down to simpler request formats when the model rejects the request", async () => {
    script = [failure(400, "response_format json_schema is not supported for this model"), failure(400, "strict is not supported"), ok(brief())];
    const b = backend(["openai/gpt-oss-120b"]);
    await b.complete("S", "U");

    assert.equal(requests[0]!.body.reasoning_effort, "low");
    assert.equal(requests[1]!.body.reasoning_effort, undefined);
    assert.equal(requests[1]!.body.response_format.type, "json_schema");
    assert.equal(requests[2]!.body.response_format.type, "json_object");
    assert.match(requests[2]!.body.messages[0].content, /JSON Schema/);

    script = [ok(brief())];
    await b.complete("S", "U");
    assert.equal(requests[3]!.body.response_format.type, "json_object", "the working format is remembered");
  });

  it("treats a schema-validation failure as an invalid draft, and the analyzer retries with feedback", async () => {
    script = [failure(400, "Failed to generate JSON", "json_validate_failed"), ok(brief())];
    const outcome = await createAnalyzer({ backend: backend() })(input);
    assert.equal(outcome.kind, "publish");
    assert.equal(requests.length, 2);
    assert.match(requests[1]!.body.messages[1].content, /previous draft was rejected.*not valid JSON/s);
  });

  it("treats a truncated reply as an invalid draft", async () => {
    script = [ok(brief(), {}, "length")];
    const reply = await backend().complete("S", "U");
    assert.equal(reply.data, null);
  });

  it("accepts JSON wrapped in code fences", async () => {
    script = [ok("```json\n" + JSON.stringify(brief()) + "\n```")];
    const reply = await backend().complete("S", "U");
    assert.equal((reply.data as { category: string }).category, "PAKISTAN");
  });

  it("stops the run on a rejected API key", async () => {
    script = [failure(401, "Invalid API Key")];
    await assert.rejects(backend().complete("S", "U"), (e: unknown) => e instanceof AiUnavailableError && /GROQ_API_KEY/.test(e.message));
  });

  it("skips a model that is not available and uses the next one", async () => {
    script = [failure(404, "The model `openai/gpt-oss-120b` does not exist"), ok(brief())];
    const b = backend();
    await b.complete("S", "U");
    assert.deepEqual(requests.map((r) => r.body.model), ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    script = [ok(brief())];
    await b.complete("S", "U");
    assert.equal(requests[2]!.body.model, "openai/gpt-oss-20b", "the missing model stays skipped");
  });

  it("paces itself from the rate-limit headers instead of running into a 429", async () => {
    script = [ok(brief(), { "x-ratelimit-remaining-tokens": "1200", "x-ratelimit-reset-tokens": "7.5s" }), ok(brief())];
    const b = backend(["openai/gpt-oss-120b"]);
    await b.complete("S", "U");
    await b.complete("S", "U");
    assert.deepEqual(sleeps, [7_750]);
  });

  it("stops using a model for the day when its request budget is spent", async () => {
    script = [ok(brief(), { "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "8h" }), ok(brief())];
    const b = backend();
    await b.complete("S", "U");
    await b.complete("S", "U");
    assert.deepEqual(requests.map((r) => r.body.model), ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
  });

  it("sends one request at a time even when asked for several at once", async () => {
    delayMs = 25;
    script = [ok(brief()), ok(brief()), ok(brief())];
    const b = backend();
    await Promise.all([b.complete("S", "U"), b.complete("S", "U"), b.complete("S", "U")]);
    assert.equal(requests.length, 3);
    assert.equal(maxInFlight, 1);
  });

  it("retries a server error, then gives an ordinary (item-level) error if it persists", async () => {
    script = [failure(503, "overloaded"), ok(brief())];
    await backend().complete("S", "U");
    assert.equal(requests.length, 2);

    script = Array.from({ length: 12 }, () => failure(503, "overloaded"));
    await assert.rejects(backend().complete("S", "U"), (e: unknown) => e instanceof Error && !(e instanceof AiUnavailableError) && /after 10 attempts/.test(e.message));
  });
});

describe("provider selection", () => {
  it("picks Anthropic by default and Groq when only a Groq key is present", () => {
    assert.equal(resolveProvider({}), "anthropic");
    assert.equal(resolveProvider({ GROQ_API_KEY: "g" }), "groq");
    assert.equal(resolveProvider({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" }), "anthropic");
    assert.equal(resolveProvider({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a", AI_PROVIDER: "GROQ" }), "groq");
    assert.equal(resolveProvider({ AI_PROVIDER: "anthropic", GROQ_API_KEY: "g" }), "anthropic");
  });

  it("lists the Groq models, best first, with an override", () => {
    assert.deepEqual(groqModels({}), ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
    assert.deepEqual(groqModels({ GROQ_MODELS: " a/b , c/d ,," }), ["a/b", "c/d"]);
  });

  it("reports configuration problems", () => {
    assert.deepEqual(aiConfigProblems({}), ["ANTHROPIC_API_KEY (or GROQ_API_KEY for the free option)"]);
    assert.deepEqual(aiConfigProblems({ AI_PROVIDER: "groq" }), ["GROQ_API_KEY (free key from console.groq.com)"]);
    assert.deepEqual(aiConfigProblems({ GROQ_API_KEY: "g" }), []);
    assert.deepEqual(aiConfigProblems({ ANTHROPIC_API_KEY: "a" }), []);
    assert.match(aiConfigProblems({ AI_PROVIDER: "openai" })[0]!, /must be "groq" or "anthropic"/);
  });

  it("describes the active setup", () => {
    assert.match(aiLabel({ GROQ_API_KEY: "g" }), /^Groq \(free tier\): openai\/gpt-oss-120b/);
    assert.equal(aiLabel({ ANTHROPIC_API_KEY: "a", AI_MODEL: "claude-haiku-4-5" }), "Anthropic: claude-haiku-4-5");
  });

  it("gives the free tier a gentler ingestion profile, which env vars can override", () => {
    const free = loadSettings({ GROQ_API_KEY: "g" });
    assert.deepEqual([free.intervalMinutes, free.maxItemsPerSource, free.maxItemsPerRun], [30, 3, 5]);
    const paid = loadSettings({ ANTHROPIC_API_KEY: "a" });
    assert.deepEqual([paid.intervalMinutes, paid.maxItemsPerSource, paid.maxItemsPerRun], [15, 8, 0]);
    const tuned = loadSettings({ GROQ_API_KEY: "g", INGEST_INTERVAL_MINUTES: "20", INGEST_MAX_ITEMS_PER_RUN: "12", INGEST_MAX_ITEMS_PER_SOURCE: "2" });
    assert.deepEqual([tuned.intervalMinutes, tuned.maxItemsPerSource, tuned.maxItemsPerRun], [20, 2, 12]);
  });
});
