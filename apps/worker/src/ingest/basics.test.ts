import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TitleIndex, titleTokens, tokenSimilarity } from "./similarity";
import { decodeEntities, htmlToText, longestSharedRun, truncate, wordCount, words } from "./text";
import { finalUrgency } from "./urgency";
import { canonicalizeUrl, shortHash, slugify, uniqueSlug } from "./url";

describe("text", () => {
  it("decodes named and numeric entities", () => {
    assert.equal(decodeEntities("Tom &amp; Jerry &#8217;s &#x26; &quot;x&quot; &bogus;"), "Tom & Jerry ’s & \"x\" &bogus;");
  });

  it("turns an HTML fragment into clean text and drops the WordPress footer", () => {
    const html = "<p>Hello <b>world</b> &amp; more.</p><script>alert(1)</script><p>Second&nbsp;line</p> The post Foo appeared first on Example News.";
    assert.equal(htmlToText(html), "Hello world & more.\nSecond line");
  });

  it("handles double-escaped markup", () => {
    assert.equal(htmlToText("&lt;p&gt;Escaped &lt;b&gt;markup&lt;/b&gt;&lt;/p&gt;"), "Escaped markup");
  });

  it("decodes the extra named entities feeds send, and drops the invisible soft hyphen", () => {
    assert.equal(decodeEntities("&copy; 2026 &laquo;G12&raquo; 25&deg; &pound;5 &euro;6 &bull; a&middot;b 2&times;3"), "© 2026 «G12» 25° £5 €6 • a·b 2×3");
    assert.equal(htmlToText("Khyber Pakh&shy;tunkhwa and Bhu&#173;tto and Bhut&#xAD;to"), "Khyber Pakhtunkhwa and Bhutto and Bhutto");
    assert.equal(decodeEntities("&bogus; stays"), "&bogus; stays", "unknown entities are left alone");
  });

  it("decodes accented letters with the right case, and drops zero-width joiners", () => {
    assert.equal(decodeEntities("M&uuml;ller &Eacute;cole Zo&euml; &szlig; &Ntilde;&ntilde; &AElig;&aelig; &yuml; &Agrave;&agrave;"), "Müller École Zoë ß Ññ Ææ ÿ Àà");
    assert.equal(decodeEntities("AT&AMP;T &Nbsp;x"), "AT&T  x", "an all-caps or odd-case spelling still decodes");
    assert.equal(htmlToText("a&zwnj;b&#8204;c&zwj;d&#x200B;e"), "abcde");
    assert.equal(decodeEntities("&times;&divide;"), "×÷", "the Latin-1 run must not shift: times and divide sit inside it");
  });

  it("decodes text that was escaped twice, without touching ordinary text", () => {
    assert.equal(htmlToText("People&amp;rsquo;s voice &amp;amp; more"), "People’s voice & more");
    assert.equal(htmlToText("Q&A and R&D; plus AT&T"), "Q&A and R&D; plus AT&T");
  });

  it("truncates on a word boundary", () => {
    assert.equal(truncate("one two three four five", 14), "one two three…");
    assert.equal(truncate("short", 14), "short");
  });

  it("counts words in any script", () => {
    assert.equal(wordCount("The PM's visit — 3 days!"), 6);
    assert.deepEqual(words("Hello, World"), ["hello", "world"]);
  });

  it("finds the longest shared run of words", () => {
    const a = words("the prime minister said on saturday that the budget will pass");
    const b = words("officials confirmed the prime minister said on saturday nothing else");
    assert.equal(longestSharedRun(a, b), 6); // "the prime minister said on saturday"
    assert.equal(longestSharedRun(words("alpha beta"), words("gamma delta")), 0);
  });
});

describe("url", () => {
  it("canonicalizes: strips tracking params, fragment, trailing slash; lower-cases the host", () => {
    assert.equal(canonicalizeUrl("HTTPS://WWW.Dawn.com/news/123/?utm_source=x&id=5&fbclid=z#comments"), "https://www.dawn.com/news/123?id=5");
    assert.equal(canonicalizeUrl("https://example.com/"), "https://example.com/");
  });

  it("rejects non-http URLs", () => {
    assert.equal(canonicalizeUrl("javascript:alert(1)"), null);
    assert.equal(canonicalizeUrl("not a url"), null);
    assert.equal(canonicalizeUrl("ftp://example.com/x"), null);
  });

  it("slugifies", () => {
    assert.equal(slugify("PM's Visit: Saudi & Pakistan sign 5 deals!"), "pms-visit-saudi-and-pakistan-sign-5-deals");
    assert.equal(slugify("Café résumé"), "cafe-resume");
    assert.equal(slugify("اردو"), "");
    const long = slugify("word ".repeat(40));
    assert.ok(long.length <= 80 && !long.endsWith("-"));
  });

  it("finds a free slug", async () => {
    const taken = new Set(["story", `story-${shortHash("https://a.example/1")}`]);
    const slug = await uniqueSlug("story", "https://a.example/1", async (s) => taken.has(s));
    assert.equal(slug, `story-${shortHash("https://a.example/1")}-2`);
    assert.equal(await uniqueSlug("fresh", "https://a.example/1", async () => false), "fresh");
    assert.equal(await uniqueSlug("", "https://a.example/1", async () => false), "story");
  });
});

describe("title similarity", () => {
  const a = "PM Shehbaz Sharif meets Saudi crown prince in Riyadh";
  const b = "Shehbaz Sharif meets Saudi crown prince, Riyadh visit";

  it("scores the same story reported by two outlets high", () => {
    assert.ok(tokenSimilarity(titleTokens(a), titleTokens(b)) >= 0.75);
  });

  it("scores templated headlines below the auto-drop threshold, so the AI decides", () => {
    const score = tokenSimilarity(titleTokens("Pakistan beat India by 5 wickets in Asia Cup"), titleTokens("Pakistan beat Bangladesh by 5 wickets in Asia Cup"));
    assert.ok(score > 0.4 && score < 0.9, `score was ${score}`);
    assert.ok(tokenSimilarity(titleTokens("Pakistan beat India by 5 wickets"), titleTokens("Pakistan beat India by 6 wickets")) < 1, "numbers distinguish headlines");
  });

  it("scores unrelated headlines low", () => {
    const other = "Pakistan beat India by six wickets in Asia Cup opener";
    assert.ok(tokenSimilarity(titleTokens(a), titleTokens(other)) < 0.2);
  });

  it("does not match tiny headlines unless identical", () => {
    assert.equal(tokenSimilarity(titleTokens("Live updates"), titleTokens("Live blog")), 0);
  });

  it("finds ranked matches in an index", () => {
    const index = new TitleIndex<string>();
    index.add("Budget 2026 unveiled: tax relief for salaried class", "budget");
    index.add(a, "pm");
    const hits = index.matches(b, 0.4);
    assert.equal(hits[0]?.entry.ref, "pm");
    assert.equal(hits.length, 1);
  });
});

describe("urgency", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it("keeps the model score for a fresh, unremarkable story", () => {
    assert.equal(finalUrgency(6, minutesAgo(30), now, "Committee meets on budget"), 6);
  });

  it("adds one for a fresh story with an urgent keyword", () => {
    assert.equal(finalUrgency(6, minutesAgo(20), now, "Three killed in blast near market"), 7);
  });

  it("caps stale stories so they can never be breaking", () => {
    assert.equal(finalUrgency(9, minutesAgo(8 * 60), now, "Blast kills 10"), 5);
    assert.equal(finalUrgency(10, minutesAgo(30 * 60), now, "Blast kills 10"), 3);
  });

  it("clamps to 0-10", () => {
    assert.equal(finalUrgency(10, minutesAgo(5), now, "Breaking: PM resigns"), 10);
    assert.equal(finalUrgency(-4, minutesAgo(5), now, "x"), 0);
    assert.equal(finalUrgency(Number.NaN, minutesAgo(5), now, "x"), 0);
  });
});
