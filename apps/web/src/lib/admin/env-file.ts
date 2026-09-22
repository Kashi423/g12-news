/**
 * Editing a `.env` file's text for `npm run admin:setup`. Line based on purpose: a regex with `^` and `\s*`
 * treats a lone "\r" as a line start and swallows the "\n" after it, which glues two lines together in a
 * Windows (CRLF) file. The file's own line ending is kept, and every line the script does not own is left
 * exactly as it was.
 */

const lineFor = (key: string) => new RegExp(`^\\s*${key}\\s*=`);

/** Set KEY="value": replaces the existing line for KEY, or adds one at the end. */
export function setEnv(text: string, key: string, value: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const line = `${key}="${value}"`;
  const at = lines.findIndex((l) => lineFor(key).test(l));
  if (at >= 0) lines[at] = line;
  // "a\nb\n" splits into ["a", "b", ""]: the empty last piece is the final newline, so insert before it.
  else if (lines[lines.length - 1] === "") lines.splice(lines.length - 1, 0, line);
  else lines.push(line, "");
  return lines.join(eol);
}

/** Is KEY set to something (not commented out, not empty)? */
export function hasEnv(text: string, key: string): boolean {
  return text.split(/\r?\n/).some((l) => new RegExp(`^\\s*${key}\\s*=\\s*["']?\\S`).test(l) && !new RegExp(`^\\s*${key}\\s*=\\s*["']{2}\\s*$`).test(l));
}
