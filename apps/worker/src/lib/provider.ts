export type AiProvider = "anthropic" | "groq";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";
/** Free-plan chat models on Groq, best first. Override with GROQ_MODELS. */
export const DEFAULT_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];

/**
 * Which AI provider to use: AI_PROVIDER if set; otherwise Groq when only a Groq key is present
 * (the free option), else Anthropic.
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "groq" || explicit === "anthropic") return explicit;
  const hasAnthropicKey = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  return env.GROQ_API_KEY && !hasAnthropicKey ? "groq" : "anthropic";
}

export function groqModels(env: NodeJS.ProcessEnv = process.env): string[] {
  const listed = (env.GROQ_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return listed.length ? listed : DEFAULT_GROQ_MODELS;
}

/** Short description of the active AI setup for log banners. */
export function aiLabel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveProvider(env) === "groq" ? `Groq (free tier): ${groqModels(env).join(", ")}` : `Anthropic: ${env.AI_MODEL || DEFAULT_ANTHROPIC_MODEL}`;
}

/** Configuration problems that stop the AI from working, as messages ready to print. */
export function aiConfigProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const explicit = env.AI_PROVIDER?.trim();
  if (explicit && !["groq", "anthropic"].includes(explicit.toLowerCase())) return [`AI_PROVIDER must be "groq" or "anthropic" (got "${explicit}")`];
  if (resolveProvider(env) === "groq") return env.GROQ_API_KEY ? [] : ["GROQ_API_KEY (free key from console.groq.com)"];
  return env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN ? [] : ["ANTHROPIC_API_KEY (or GROQ_API_KEY for the free option)"];
}
