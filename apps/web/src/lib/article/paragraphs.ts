/**
 * Turn the stored summary into short paragraphs for reading.
 *
 * The AI is asked for "plain paragraphs" but does not always separate them, so the body may arrive as
 * one 200-word block. Newlines are kept as the writer's paragraph breaks; a paragraph that is still long
 * is cut at sentence boundaries into chunks of about TARGET_WORDS, so a story always reads as a few short
 * paragraphs. The words themselves are never changed.
 */

const TARGET_WORDS = 55;
/** A paragraph up to this long is left alone. */
const LONG_PARAGRAPH_WORDS = 90;

// Words that end in a full stop without ending the sentence: "Dr. Khan", "Rs. 5 million", "U.S. officials".
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "rs", "no", "vs", "etc", "gen", "col", "lt", "capt", "maj", "sgt",
  "sen", "rep", "gov", "govt", "hon", "inc", "ltd", "co", "corp", "mt", "u.s", "u.k", "u.n", "p.m", "a.m", "e.g", "i.e",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
]);

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function endsWithAbbreviation(text: string): boolean {
  const last = /([\p{L}.]+)\.$/u.exec(text)?.[1];
  if (!last) return false;
  // A single capital letter is an initial ("Imran H. Khan"); otherwise look the word up.
  return (last.length === 1 && last === last.toUpperCase()) || ABBREVIATIONS.has(last.toLowerCase());
}

/** Split running text into sentences, without cutting after abbreviations and initials. */
export function splitSentences(text: string): string[] {
  const pieces = text.split(/(?<=[.!?…]["'”’)\]]*)\s+(?=["'“‘(]?[\p{Lu}\p{N}])/u);
  const sentences: string[] = [];
  for (const piece of pieces) {
    const previous = sentences[sentences.length - 1];
    if (previous !== undefined && endsWithAbbreviation(previous)) sentences[sentences.length - 1] = `${previous} ${piece}`;
    else sentences.push(piece);
  }
  return sentences;
}

function chunk(paragraph: string): string[] {
  if (wordCount(paragraph) <= LONG_PARAGRAPH_WORDS) return [paragraph];
  const chunks: string[] = [];
  let current: string[] = [];
  let words = 0;
  for (const sentence of splitSentences(paragraph)) {
    const count = wordCount(sentence);
    // Close the current chunk once adding this sentence would push it past the target (but never leave one empty).
    if (current.length > 0 && words + count > TARGET_WORDS) {
      chunks.push(current.join(" "));
      current = [];
      words = 0;
    }
    current.push(sentence);
    words += count;
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

/** The body as paragraphs, in order. Empty for an empty body. */
export function toParagraphs(body: string): string[] {
  return body
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap(chunk);
}
