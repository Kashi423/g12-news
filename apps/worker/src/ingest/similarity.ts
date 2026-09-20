import { decodeEntities } from "./text";

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by for from has have had he her his how i if in into is it its of on or our over " +
    "she so than that the their them then there these they this those to too under up us was we were what when where " +
    "which while who whom why will with would you your amid after before against about across new latest live update " +
    "says said say told tells report reports reported news"
  ).split(" "),
);

function stem(token: string): string {
  return token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token;
}

/** Distinctive lower-cased tokens of a headline (stop-words dropped, plurals folded). */
export function titleTokens(title: string): Set<string> {
  const tokens = decodeEntities(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => (t.length > 1 || /\d/.test(t)) && !STOPWORDS.has(t)) // keep single digits: "5 wickets" vs "6 wickets"
    .map(stem);
  return new Set(tokens);
}

/** Ochiai (cosine on sets) similarity, 0..1. Headlines with fewer than 3 tokens only match if identical. */
export function tokenSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared++;
  if (a.size < 3 || b.size < 3) return shared === a.size && shared === b.size ? 1 : 0;
  return shared / Math.sqrt(a.size * b.size);
}

export interface IndexEntry<T> {
  title: string;
  tokens: Set<string>;
  ref: T;
}

export interface Match<T> {
  entry: IndexEntry<T>;
  score: number;
  /** Number of distinctive words the two headlines have in common. */
  shared: number;
}

/** A small in-memory list of headlines that can be searched for near-duplicates. */
export class TitleIndex<T> {
  private readonly entries: IndexEntry<T>[] = [];

  add(title: string, ref: T): void {
    this.entries.push({ title, tokens: titleTokens(title), ref });
  }

  get size(): number {
    return this.entries.length;
  }

  /** Entries scoring at least `minScore` and sharing at least `minShared` words with `title`, best first. */
  matches(title: string, minScore: number, limit = 5, minShared = 0): Match<T>[] {
    const tokens = titleTokens(title);
    return this.entries
      .map((entry) => ({ entry, score: tokenSimilarity(tokens, entry.tokens), shared: [...tokens].filter((t) => entry.tokens.has(t)).length }))
      .filter((m) => m.score >= minScore && m.shared >= minShared)
      .sort((x, y) => y.score - x.score)
      .slice(0, limit);
  }
}
