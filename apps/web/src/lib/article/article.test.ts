import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SOURCE_LINK_REL } from "@g12/config";
import { truncateLabel } from "./format";
import { safeHttpUrl } from "./links";
import { articleMetadata } from "./metadata";
import { splitSentences, toParagraphs } from "./paragraphs";
import { readingProgress } from "./progress";
import { shareTargets } from "./share";
import { isValidSlug } from "./slug";
import { formatStoryTime, wasUpdated } from "./time";
import { shouldCountView } from "./traffic";
import type { ArticleDetail } from "./types";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const ANDROID = "Mozilla/5.0 (Linux; Android 13; TECNO KG5k) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const FB_APP = "Mozilla/5.0 (Linux; Android 13; Infinix X669) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.0.0;]";

describe("isValidSlug", () => {
  it("accepts the slugs the worker makes", () => {
    for (const slug of ["pm-meets-saudi-crown-prince", "budget-2026", "a", "story-9x3k"]) assert.equal(isValidSlug(slug), true, slug);
  });
  it("rejects anything else without needing the database", () => {
    const bad = ["", "Upper-Case", "with space", "under_score", "double--hyphen", "-leading", "trailing-", "../etc/passwd", "a/b", "café", "x".repeat(161), "<script>", "1;drop table"];
    for (const slug of bad) assert.equal(isValidSlug(slug), false, JSON.stringify(slug));
  });
});

describe("shouldCountView", () => {
  it("counts ordinary browsers, including phones, in-app browsers and Opera Mini", () => {
    const operaMini = "Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16";
    for (const ua of [CHROME, ANDROID, FB_APP, operaMini]) assert.equal(shouldCountView(headers({ "user-agent": ua })), true, ua);
  });
  it("skips scripts and libraries that do not name a browser", () => {
    for (const ua of ["node", "undici", "Dart/3.0 (dart:io)", "Go-http-client/2.0", "Java/17.0.1", "PHP/8.2", "okhttp/4.12.0", "axios/1.6.0"]) {
      assert.equal(shouldCountView(headers({ "user-agent": ua })), false, ua);
    }
  });
  it("skips link-preview fetchers, crawlers, monitors and scripts", () => {
    const skipped = [
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Twitterbot/1.0",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "Slackbot-LinkExpanding 1.0",
      "Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/126.0.0.0 Safari/537.36",
      "curl/8.4.0",
      "python-requests/2.31",
      "UptimeRobot/2.0",
      "node-fetch/1.0",
    ];
    for (const ua of skipped) assert.equal(shouldCountView(headers({ "user-agent": ua })), false, ua);
  });
  it("skips a request with no user agent", () => {
    assert.equal(shouldCountView(headers({})), false);
    assert.equal(shouldCountView(headers({ "user-agent": "   " })), false);
  });
  it("skips prefetches: the reader has not opened the story yet", () => {
    assert.equal(shouldCountView(headers({ "user-agent": CHROME, "next-router-prefetch": "1" })), false);
    assert.equal(shouldCountView(headers({ "user-agent": CHROME, purpose: "prefetch" })), false);
    assert.equal(shouldCountView(headers({ "user-agent": CHROME, "sec-purpose": "prefetch;prerender" })), false);
  });
});

const norm = (text: string) => text.replace(/\s+/g, " ").trim();

describe("toParagraphs", () => {
  it("keeps the writer's paragraph breaks", () => {
    assert.deepEqual(toParagraphs("First paragraph.\n\nSecond one.\r\n\r\nThird."), ["First paragraph.", "Second one.", "Third."]);
  });
  it("treats a single newline as a break, trims, and drops blanks", () => {
    assert.deepEqual(toParagraphs("  One.  \n   \nTwo   with   gaps.\n"), ["One.", "Two with gaps."]);
    assert.deepEqual(toParagraphs(""), []);
    assert.deepEqual(toParagraphs("  \n \n"), []);
  });
  it("leaves a short single paragraph alone", () => {
    const text = "A short summary of the story. It has two sentences.";
    assert.deepEqual(toParagraphs(text), [text]);
  });

  const sentence = (n: number) => `Officials in district ${n} said the review would continue for several more days before any decision is taken.`;
  const longBlock = Array.from({ length: 12 }, (_, i) => sentence(i + 1)).join(" ");

  it("cuts one long block into several short paragraphs at sentence ends, changing no words", () => {
    const paragraphs = toParagraphs(longBlock);
    assert.ok(paragraphs.length >= 3, `expected 3+ paragraphs, got ${paragraphs.length}`);
    for (const p of paragraphs) {
      assert.ok(p.split(" ").length <= 70, `paragraph too long: ${p.split(" ").length} words`);
      assert.match(p, /\.$/, "each paragraph ends at a sentence end");
    }
    assert.equal(norm(paragraphs.join(" ")), norm(longBlock));
  });
  it("splits an over-long paragraph even when the writer did separate some", () => {
    const paragraphs = toParagraphs(`Short lead.\n\n${longBlock}`);
    assert.equal(paragraphs[0], "Short lead.");
    assert.ok(paragraphs.length >= 4);
  });
  it("does not cut after abbreviations, initials or numbers", () => {
    assert.deepEqual(splitSentences("Dr. Khan met Mr. Ali. Rs. 5 million was approved. He left."), ["Dr. Khan met Mr. Ali.", "Rs. 5 million was approved.", "He left."]);
    assert.deepEqual(splitSentences("Imran H. Khan spoke. U.S. officials replied. Inflation hit 9.5 percent. Done."), ["Imran H. Khan spoke.", "U.S. officials replied.", "Inflation hit 9.5 percent.", "Done."]);
    assert.deepEqual(splitSentences("He asked “Why?” Nobody answered."), ["He asked “Why?”", "Nobody answered."]);
  });
  it("copes with text that has no sentence ends at all", () => {
    const blob = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    assert.deepEqual(toParagraphs(blob), [blob]);
  });
});

describe("shareTargets", () => {
  const url = "https://g12news.com/article/pm-meets-crown-prince";
  const title = "PM meets Saudi crown prince & signs deal";
  const targets = shareTargets({ title, url });

  it("puts WhatsApp first, then Facebook, then X", () => {
    assert.deepEqual(targets.map((t) => t.id), ["whatsapp", "facebook", "x"]);
  });
  it("builds each network's own share link with the title and URL encoded", () => {
    const [whatsapp, facebook, x] = targets.map((t) => new URL(t.href));
    assert.equal(whatsapp!.origin + whatsapp!.pathname, "https://wa.me/");
    assert.equal(whatsapp!.searchParams.get("text"), `${title}\n${url}`, "one block of text: the headline, then the link");
    assert.equal(facebook!.origin + facebook!.pathname, "https://www.facebook.com/sharer/sharer.php");
    assert.equal(facebook!.searchParams.get("u"), url);
    assert.equal(x!.origin + x!.pathname, "https://x.com/intent/post");
    assert.equal(x!.searchParams.get("text"), title);
    assert.equal(x!.searchParams.get("url"), url);
  });
  it("cannot be broken out of by a hostile headline", () => {
    const [w] = shareTargets({ title: 'x&url=https://evil.example"><script>', url });
    assert.doesNotMatch(w!.href, /[<>" ]/);
    assert.equal(new URL(w!.href).searchParams.get("text")?.includes("evil.example"), true, "it is just encoded text");
  });
});

describe("safeHttpUrl and the source link rel", () => {
  it("passes http(s) addresses and refuses everything else", () => {
    assert.equal(safeHttpUrl("https://www.dawn.com/news/1234"), "https://www.dawn.com/news/1234");
    assert.equal(safeHttpUrl("  http://example.com/a?b=1  "), "http://example.com/a?b=1");
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "//example.com", "not a url", "", null, undefined, "ftp://example.com"]) {
      assert.equal(safeHttpUrl(bad), null, String(bad));
    }
  });
  it("the source link is nofollow, noopener and noreferrer", () => {
    assert.deepEqual(new Set(SOURCE_LINK_REL.split(" ")), new Set(["nofollow", "noopener", "noreferrer"]));
  });
});

describe("story times", () => {
  it("formats in Pakistan time, whatever the server's own zone", () => {
    assert.equal(formatStoryTime("2026-09-20T21:49:00.000Z"), "21 September 2026, 2:49 AM PKT");
    assert.equal(formatStoryTime("2026-01-05T07:05:00.000Z"), "5 January 2026, 12:05 PM PKT");
    assert.equal(formatStoryTime("garbage"), "");
  });
  it("shows Updated only for a real later change", () => {
    const published = "2026-09-20T10:00:00.000Z";
    assert.equal(wasUpdated(published, null), false);
    assert.equal(wasUpdated(published, "2026-09-20T10:00:30.000Z"), false, "under a minute later is not an update");
    assert.equal(wasUpdated(published, "2026-09-20T09:00:00.000Z"), false, "before publication is not an update");
    assert.equal(wasUpdated(published, "2026-09-20T10:05:00.000Z"), true);
    assert.equal(wasUpdated(published, "nonsense"), false);
  });
});

describe("readingProgress", () => {
  it("is 0 until the story reaches the top, then rises to 1 and stays there", () => {
    assert.equal(readingProgress(300, 3000, 800), 0, "story still below the top of the screen");
    assert.equal(readingProgress(0, 3000, 800), 0);
    const mid = readingProgress(-1300, 3000, 800);
    assert.ok(mid > 0.4 && mid < 0.6, `about half way, got ${mid}`);
    assert.equal(readingProgress(-2600, 3000, 800), 1, "end of the story at the middle of the screen");
    assert.equal(readingProgress(-9000, 3000, 800), 1);
  });
  it("copes with a story shorter than the screen and with degenerate input", () => {
    assert.equal(readingProgress(0, 300, 800), 0);
    assert.equal(readingProgress(-100, 300, 800), 1);
    assert.equal(readingProgress(Number.NaN, 3000, 800), 0);
    assert.equal(readingProgress(-10, 0, 0), 1);
  });
});

describe("truncateLabel", () => {
  it("leaves short text alone and cuts long text at a word with an ellipsis", () => {
    assert.equal(truncateLabel("Short headline"), "Short headline");
    const cut = truncateLabel("Pakistan and Saudi Arabia sign a landmark defence pact after talks in Riyadh on Tuesday", 40);
    assert.ok(cut.length <= 40, cut);
    assert.match(cut, /…$/);
    assert.doesNotMatch(cut, / …$/);
  });
});

describe("articleMetadata", () => {
  const base: ArticleDetail = {
    id: "id1",
    slug: "pm-meets-crown-prince",
    title: "PM meets Saudi crown prince",
    excerpt: "The prime minister held talks in Riyadh on trade and investment.",
    body: "Body text.",
    imageUrl: "https://i.dawn.com/large/2026/09/photo.jpg",
    imageCredit: "AP Photo",
    category: "POLITICS",
    tags: ["shehbaz sharif", "saudi arabia"],
    sourceName: "Dawn",
    sourceUrl: "https://www.dawn.com/news/1",
    publishedAt: "2026-09-20T10:00:00.000Z",
    correctedAt: null,
    isBreaking: false,
  };

  it("gives the page its own title, description and canonical address", () => {
    const meta = articleMetadata(base);
    assert.equal(meta.title, base.title);
    assert.equal(meta.description, base.excerpt);
    assert.equal(meta.alternates?.canonical, "/article/pm-meets-crown-prince");
  });
  it("fills Open Graph and Twitter Card tags with the story's image, title and excerpt", () => {
    const meta = articleMetadata({ ...base, correctedAt: "2026-09-20T12:00:00.000Z" });
    const og = meta.openGraph as Record<string, unknown>;
    assert.equal(og.type, "article");
    assert.equal(og.title, base.title);
    assert.equal(og.description, base.excerpt);
    assert.equal(og.url, "/article/pm-meets-crown-prince");
    assert.equal(og.publishedTime, base.publishedAt);
    assert.equal(og.modifiedTime, "2026-09-20T12:00:00.000Z");
    assert.equal(og.section, "Politics");
    assert.deepEqual(og.tags, base.tags);
    assert.deepEqual(og.images, [{ url: base.imageUrl, alt: base.title }]);
    const tw = meta.twitter as Record<string, unknown>;
    assert.equal(tw.card, "summary_large_image");
    assert.equal(tw.title, base.title);
    assert.equal(tw.description, base.excerpt);
    assert.deepEqual(tw.images, [base.imageUrl]);
  });
  it("without a picture, shares the site's default preview image instead of nothing", () => {
    const meta = articleMetadata({ ...base, imageUrl: null });
    assert.deepEqual((meta.openGraph as { images: unknown[] }).images, [{ url: "/opengraph-image.jpg", width: 1200, height: 630, alt: "G12 News: Pakistan, As It Happens" }]);
    const tw = meta.twitter as Record<string, unknown>;
    assert.equal(tw.card, "summary_large_image");
    assert.deepEqual(tw.images, ["/opengraph-image.jpg"]);
  });
  it("reports a modified time only for a real update", () => {
    assert.equal((articleMetadata(base).openGraph as Record<string, unknown>).modifiedTime, undefined);
  });
});
