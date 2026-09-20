const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

const TAG = /<\/?[a-z][^>]*>/gi;

/** RSS descriptions are HTML fragments: reduce one to plain, single-spaced text. */
export function htmlToText(html: string): string {
  let text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n");
  text = decodeEntities(text.replace(TAG, " "));
  if (TAG.test(text)) {
    // Double-escaped markup (&lt;p&gt;) survives the first pass.
    TAG.lastIndex = 0;
    text = decodeEntities(text.replace(TAG, " "));
  }
  TAG.lastIndex = 0;
  return text
    .replace(/\bThe post .{0,300}? appeared first on .{0,120}$/i, "") // WordPress footer
    .replace(/\s*(\[…\]|\[\.\.\.\]|…)\s*$/u, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Typographic punctuation to plain ASCII, for console output: Windows terminals often mangle it. */
export function plain(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ");
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Lower-cased word tokens (letters and digits, any script). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return words(text).length;
}

/** Length (in words) of the longest run of consecutive words that appears in both texts. */
export function longestSharedRun(a: readonly string[], b: readonly string[]): number {
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1]! + 1;
        if (current[j]! > best) best = current[j]!;
      }
    }
    previous = current;
  }
  return best;
}
