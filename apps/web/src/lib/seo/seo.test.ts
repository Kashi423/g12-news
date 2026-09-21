import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ArticleDetail } from "../article/types";
import { articleBreadcrumbs, articleImageUrl, breadcrumbSchema, categoryBreadcrumbs, jsonLdString, newsArticleSchema, siteGraph } from "./json-ld";
import { createShareImageCache } from "./share-image";
import { buildSitemap, SITEMAP_MAX_ARTICLES } from "./sitemap";
import { configuredSocialUrls, type SiteInfo } from "./site";

const site: SiteInfo = { origin: "https://g12news.com", logoUrl: "https://g12news.com/icon.jpg", sameAs: [], contactEmail: null };

const article: ArticleDetail = {
  id: "a1",
  slug: "kohat-attack-cte-case",
  title: "CTD registers terror case over deadly Kohat Police Lines attack",
  excerpt: "A case has been registered over the attack.",
  body: "Body.",
  imageUrl: "https://i.dawn.com/large/x.webp",
  imageCredit: null,
  category: "PAKISTAN",
  tags: ["kohat", "terrorism"],
  sourceName: "Dawn",
  sourceUrl: "https://www.dawn.com/news/2031471/case",
  publishedAt: "2026-09-21T02:39:38.000Z",
  correctedAt: null,
  isBreaking: false,
};

const parse = (text: string) => JSON.parse(text) as Record<string, unknown>;

/** Reads a nested value by path ("publisher.logo.url"; a number picks an array element): keeps these tests free of `any`. */
function at(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current === null || typeof current !== "object" ? undefined : (current as Record<string, unknown>)[key]), value);
}

describe("jsonLdString (safe inside a <script> tag)", () => {
  it("never lets a title end the script tag", () => {
    const text = jsonLdString({ headline: "</script><script>alert(1)</script>" });
    assert.ok(!text.includes("<"), text);
    assert.equal((parse(text).headline as string), "</script><script>alert(1)</script>", "and it still reads back exactly");
  });
  it("escapes the two line separators JavaScript treats as line breaks", () => {
    const text = jsonLdString({ a: `x${String.fromCharCode(0x2028)}y${String.fromCharCode(0x2029)}z` });
    assert.ok(!text.includes(String.fromCharCode(0x2028)) && !text.includes(String.fromCharCode(0x2029)));
    assert.equal(parse(text).a, `x${String.fromCharCode(0x2028)}y${String.fromCharCode(0x2029)}z`);
  });
  it("leaves ordinary text alone, including Urdu and quotes", () => {
    const data = { a: 'He said "hello" & left', b: "پاکستان" };
    assert.deepEqual(parse(jsonLdString(data)), data);
  });
});

describe("Organization + WebSite (site-wide)", () => {
  const graph = siteGraph(site);
  const organization = at(graph, "@graph.0");
  const website = at(graph, "@graph.1");

  it("describes the organization with a logo", () => {
    assert.equal(at(organization, "@type"), "Organization");
    assert.equal(at(organization, "name"), "G12 News");
    assert.equal(at(organization, "url"), "https://g12news.com");
    assert.equal(at(organization, "logo.@type"), "ImageObject");
    assert.equal(at(organization, "logo.url"), "https://g12news.com/icon.jpg");
    assert.ok(Number(at(organization, "logo.width")) >= 112 && Number(at(organization, "logo.height")) >= 112, "Google's minimum logo size");
  });
  it("describes the website with a SearchAction that points at /search?q=", () => {
    assert.equal(at(website, "@type"), "WebSite");
    assert.equal(at(website, "potentialAction.@type"), "SearchAction");
    assert.equal(at(website, "potentialAction.target.urlTemplate"), "https://g12news.com/search?q={search_term_string}");
    assert.equal(at(website, "potentialAction.query-input"), "required name=search_term_string", "the placeholder's name matches");
    assert.deepEqual(at(website, "publisher"), { "@id": "https://g12news.com/#organization" });
  });
  it("leaves out social profiles and a contact point that are not configured (nothing is invented)", () => {
    assert.equal(at(organization, "sameAs"), undefined);
    assert.equal(at(organization, "contactPoint"), undefined);
  });
  it("includes them when they are configured", () => {
    const configured = siteGraph({ ...site, sameAs: ["https://facebook.com/g12news"], contactEmail: "desk@g12news.com" });
    assert.deepEqual(at(configured, "@graph.0.sameAs"), ["https://facebook.com/g12news"]);
    assert.equal(at(configured, "@graph.0.contactPoint.email"), "desk@g12news.com");
  });
});

describe("NewsArticle", () => {
  const schema = newsArticleSchema(article, site);

  it("has the fields Google asks for", () => {
    assert.equal(at(schema, "@type"), "NewsArticle");
    assert.equal(at(schema, "headline"), article.title);
    assert.deepEqual(at(schema, "image"), ["https://g12news.com/article/kohat-attack-cte-case/share.jpg"]);
    assert.equal(at(schema, "datePublished"), "2026-09-21T02:39:38.000Z");
    assert.equal(at(schema, "mainEntityOfPage.@id"), "https://g12news.com/article/kohat-attack-cte-case");
  });
  it("names the Organization G12 News as the author, never a person", () => {
    assert.deepEqual(at(schema, "author"), { "@type": "Organization", name: "G12 News", url: "https://g12news.com" });
  });
  it("names the publisher, with its logo", () => {
    assert.equal(at(schema, "publisher.@type"), "Organization");
    assert.equal(at(schema, "publisher.name"), "G12 News");
    assert.equal(at(schema, "publisher.logo.@type"), "ImageObject");
    assert.equal(at(schema, "publisher.logo.url"), "https://g12news.com/icon.jpg");
  });
  it("dateModified is the publish time for a story that was never corrected, else the correction time", () => {
    assert.equal(at(schema, "dateModified"), at(schema, "datePublished"));
    const corrected = newsArticleSchema({ ...article, correctedAt: "2026-09-21T09:00:00.000Z" }, site);
    assert.equal(at(corrected, "dateModified"), "2026-09-21T09:00:00.000Z");
    assert.equal(at(corrected, "datePublished"), "2026-09-21T02:39:38.000Z");
  });
  it("says what the summary is based on: the outlet's original report", () => {
    assert.equal(at(schema, "isBasedOn.url"), "https://www.dawn.com/news/2031471/case");
    assert.equal(at(schema, "isBasedOn.publisher.name"), "Dawn");
  });
  it("includes the section and tags", () => {
    assert.equal(at(schema, "articleSection"), "Pakistan");
    assert.equal(at(schema, "keywords"), "kohat, terrorism");
  });
  it("uses the site's own image for a story with no picture", () => {
    assert.equal(articleImageUrl({ slug: "x", imageUrl: null }, site), "https://g12news.com/opengraph-image.jpg");
    const plain = newsArticleSchema({ ...article, imageUrl: null }, site);
    assert.deepEqual(at(plain, "image"), ["https://g12news.com/opengraph-image.jpg"]);
  });
  it("cuts a very long headline to Google's ~110 characters", () => {
    const long = newsArticleSchema({ ...article, title: "word ".repeat(60).trim() }, site);
    const headline = String(at(long, "headline"));
    assert.ok(headline.length <= 110, String(headline.length));
    assert.ok(headline.endsWith("…"));
  });
});

describe("BreadcrumbList", () => {
  const steps = (list: unknown) => (at(list, "itemListElement") as unknown[]).map((step) => [at(step, "position"), at(step, "name"), at(step, "item")]);

  it("numbers the steps from 1 and uses full addresses", () => {
    const list = breadcrumbSchema(categoryBreadcrumbs("SPORTS", site));
    assert.equal(at(list, "@type"), "BreadcrumbList");
    assert.deepEqual(steps(list), [
      [1, "Home", "https://g12news.com/"],
      [2, "Sports", "https://g12news.com/category/sports"],
    ]);
  });
  it("a story's trail is Home > Category > Story", () => {
    const list = breadcrumbSchema(articleBreadcrumbs(article, site));
    assert.deepEqual(steps(list).map(([, name]) => name), ["Home", "Pakistan", article.title]);
    assert.equal(steps(list)[2]![2], "https://g12news.com/article/kohat-attack-cte-case");
  });
});

describe("sitemap", () => {
  const data = {
    articles: [
      { slug: "newest", lastModified: new Date("2026-09-21T10:00:00Z") },
      { slug: "older", lastModified: new Date("2026-09-20T10:00:00Z") },
    ],
    categoryUpdated: { PAKISTAN: new Date("2026-09-21T10:00:00Z"), SPORTS: new Date("2026-09-20T10:00:00Z") } as const,
  };
  const entries = buildSitemap("https://g12news.com", data);
  const urls = entries.map((e) => e.url);

  it("lists the homepage, all nine categories, the four static pages and every story", () => {
    assert.ok(urls.includes("https://g12news.com/"));
    for (const slug of ["pakistan", "world", "politics", "business", "sports", "showbiz", "technology", "health", "miscellaneous"]) assert.ok(urls.includes(`https://g12news.com/category/${slug}`), slug);
    for (const page of ["about", "contact", "privacy", "disclaimer"]) assert.ok(urls.includes(`https://g12news.com/${page}`), page);
    assert.ok(urls.includes("https://g12news.com/article/newest") && urls.includes("https://g12news.com/article/older"));
    assert.equal(entries.length, 1 + 9 + 4 + 2);
  });
  it("does not list the search page or the API", () => {
    assert.ok(!urls.some((u) => /\/search|\/api\//.test(u)));
  });
  it("has real last-modified times: a story's own, a category's newest story, the site's newest story", () => {
    const by = (url: string) => entries.find((e) => e.url === url)!;
    assert.deepEqual(by("https://g12news.com/article/older").lastModified, new Date("2026-09-20T10:00:00Z"));
    assert.deepEqual(by("https://g12news.com/category/sports").lastModified, new Date("2026-09-20T10:00:00Z"));
    assert.deepEqual(by("https://g12news.com/").lastModified, new Date("2026-09-21T10:00:00Z"));
    assert.equal(by("https://g12news.com/category/health").lastModified, undefined, "a category with no stories has no invented date");
  });
  it("never lists an address twice", () => {
    const twice = buildSitemap("https://g12news.com", { ...data, articles: [...data.articles, data.articles[0]!] });
    assert.equal(new Set(twice.map((e) => e.url)).size, twice.length);
  });
  it("copes with no stories at all", () => {
    const empty = buildSitemap("https://g12news.com", { articles: [], categoryUpdated: {} });
    assert.equal(empty.length, 1 + 9 + 4);
  });
  it("stays within the 50,000-address limit of a sitemap file", () => {
    const many = Array.from({ length: SITEMAP_MAX_ARTICLES + 500 }, (_, i) => ({ slug: `s${i}`, lastModified: new Date(2026, 0, 1) }));
    assert.ok(buildSitemap("https://g12news.com", { articles: many, categoryUpdated: {} }).length <= 50_000);
  });
});

describe("configuredSocialUrls", () => {
  it("returns only the addresses that are really set", () => {
    assert.deepEqual(configuredSocialUrls({}), []);
    assert.deepEqual(configuredSocialUrls({ NEXT_PUBLIC_X_URL: " https://x.com/g12news ", NEXT_PUBLIC_FACEBOOK_URL: "not a url" }), ["https://x.com/g12news"]);
  });
});

describe("share image cache", () => {
  const picture = Buffer.from("jpeg bytes");
  /** A cache whose fetch answers from a script (a Buffer is a picture, null is a refusal, an Error is a network failure), and whose clock is ours. */
  function setup(script: Array<Buffer | null | Error>) {
    let calls = 0;
    let clock = 1_000_000;
    const shareImageFor = createShareImageCache({
      fetchImage: async () => {
        const next = script[Math.min(calls++, script.length - 1)];
        if (next instanceof Error) throw next;
        return next ?? null;
      },
      makeJpeg: async (source) => source,
      now: () => clock,
    });
    return { shareImageFor, calls: () => calls, wait: (ms: number) => (clock += ms) };
  }

  it("makes a picture once and keeps it", async () => {
    const { shareImageFor, calls } = setup([picture]);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), picture);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), picture);
    assert.equal(calls(), 1);
  });
  it("many crawlers asking at the same moment cost one fetch", async () => {
    const { shareImageFor, calls } = setup([picture]);
    const results = await Promise.all(Array.from({ length: 8 }, () => shareImageFor("https://i.dawn.com/a.jpg")));
    assert.ok(results.every((r) => r === picture));
    assert.equal(calls(), 1);
  });
  it("remembers a refusal (403, 429, 503...) only for a few minutes, then tries again and recovers", async () => {
    const { shareImageFor, calls, wait } = setup([null, picture]);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), null);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), null, "still remembered a minute later");
    assert.equal(calls(), 1, "no second request to the outlet while it is remembered");
    wait(6 * 60_000);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), picture, "the outlet recovered: the story gets its own picture");
    assert.equal(calls(), 2);
  });
  it("does not remember a network error or timeout at all", async () => {
    const { shareImageFor, calls } = setup([new Error("timeout"), picture]);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), null);
    assert.equal(await shareImageFor("https://i.dawn.com/a.jpg"), picture);
    assert.equal(calls(), 2);
  });
  it("keeps addresses apart", async () => {
    const { shareImageFor, calls } = setup([picture]);
    await shareImageFor("https://i.dawn.com/a.jpg");
    await shareImageFor("https://i.dawn.com/b.jpg");
    assert.equal(calls(), 2);
  });
});
