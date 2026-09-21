import { CATEGORY_IDS, type CategoryId } from "@g12/config";

/** Input checks for the admin forms. Pure, so they are tested without a database. */

export const LIMITS = { title: 300, excerpt: 300, body: 20_000, sourceName: 80, url: 500 } as const;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function isCategory(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as readonly string[]).includes(value);
}

/** A short card teaser from the start of the body (used when the owner clears the excerpt box). */
export function deriveExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= 220) return flat;
  const cut = flat.slice(0, 220);
  const sentence = cut.match(/^(.*[.!?])\s/);
  if (sentence && sentence[1]!.length >= 80) return sentence[1]!;
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

export interface StoryEdit {
  title: string;
  excerpt: string;
  body: string;
  category: CategoryId;
}

/** Edit & Approve: the fields the owner may change before a queued story goes live. */
export function validateEdit(input: { title?: unknown; excerpt?: unknown; body?: unknown; category?: unknown }): Checked<StoryEdit> {
  const title = text(input.title).replace(/\s+/g, " ");
  const body = text(input.body);
  if (title.length < 5) return { ok: false, error: "The headline is too short." };
  if (title.length > LIMITS.title) return { ok: false, error: `The headline is over ${LIMITS.title} characters.` };
  if (body.length < 40) return { ok: false, error: "The story text is too short to publish." };
  if (body.length > LIMITS.body) return { ok: false, error: `The story text is over ${LIMITS.body.toLocaleString("en")} characters.` };
  if (!isCategory(input.category)) return { ok: false, error: "Choose a category." };
  const excerpt = text(input.excerpt).replace(/\s+/g, " ") || deriveExcerpt(body);
  if (excerpt.length > LIMITS.excerpt) return { ok: false, error: `The summary line is over ${LIMITS.excerpt} characters.` };
  return { ok: true, value: { title, excerpt, body, category: input.category } };
}

export interface SourceInput {
  name: string;
  rssUrl: string;
  category: CategoryId;
  isActive: boolean;
}

/** Add / edit a source. Only http(s) feeds: the server will fetch this address. */
export function validateSource(input: { name?: unknown; rssUrl?: unknown; category?: unknown; isActive?: unknown }): Checked<SourceInput> {
  const name = text(input.name).replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Give the source a name." };
  if (name.length > LIMITS.sourceName) return { ok: false, error: `The name is over ${LIMITS.sourceName} characters.` };
  const raw = text(input.rssUrl);
  if (raw.length > LIMITS.url) return { ok: false, error: `The feed address is over ${LIMITS.url} characters.` };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "The feed address is not a valid web address (it should start with https://)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, error: "The feed address must start with http:// or https://." };
  if (!isCategory(input.category)) return { ok: false, error: "Choose a default category." };
  return { ok: true, value: { name, rssUrl: url.toString(), category: input.category, isActive: input.isActive === true || input.isActive === "on" || input.isActive === "true" } };
}
