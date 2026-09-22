import { SENSITIVE_CATEGORIES, type CategoryId } from "@g12/config";
import { words } from "./text";

/**
 * Whether a story needs stricter handling before it can auto-publish: politics and health by
 * category (see SENSITIVE_CATEGORIES), plus crime, deaths and disasters by keyword, since those are
 * not categories of their own (they fall under Pakistan/World). This is a plain keyword scan, not a
 * classifier: it is deliberately biased toward over-flagging (a routine story sent to review costs a
 * click; an unconfirmed death or crime claim published outright costs a correction).
 */
const SENSITIVE_KEYWORDS = new Set(
  (
    "killed kills kill killing dead death deaths died dies die casualties casualty injured injuries wounded " +
    "blast blasts explosion explosions bomb bombing bombed attack attacked attacks gunfire shooting shot shooter " +
    "terrorist terrorism terrorists militant militants murder murdered murderer stabbed stabbing kidnap kidnapped " +
    "hostage crash crashed collision derailed derailment earthquake tremor flood flooding flash landslide cyclone " +
    "wildfire arrested arrest raid raided charged indicted convicted sentenced verdict execution hanged riot riots " +
    "unrest clashes protest protests violence lynched suicide overdose outbreak epidemic pandemic virus contaminated " +
    "recall recalled poisoning poisoned"
  ).split(" "),
);

/** True if the category is on the stricter-review list. */
export function isSensitiveCategory(category: CategoryId): boolean {
  return (SENSITIVE_CATEGORIES as readonly string[]).includes(category);
}

/** True if the headline or brief contains crime/death/disaster language. */
export function looksSensitive(text: string): boolean {
  return words(text).some((word) => SENSITIVE_KEYWORDS.has(word));
}

/** The combined check `savePublished` uses: category-sensitive, or the text reads as crime/death/disaster. */
export function isSensitiveStory(category: CategoryId, ...texts: string[]): boolean {
  return isSensitiveCategory(category) || texts.some((text) => looksSensitive(text));
}
