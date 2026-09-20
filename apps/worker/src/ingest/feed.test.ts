import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { loadSettings } from "../settings";
import { fetchFeed, parseFeedXml, sanitizeXml } from "./feed";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Example</title>
<item>
  <title><![CDATA[Fresh &amp; new story]]></title>
  <link>https://example.com/a?utm_source=x&id=5</link>
  <description><![CDATA[<p>Hello <b>world</b> &amp; more.</p> The post Fresh appeared first on Example.]]></description>
  <pubDate>Sat, 20 Sep 2026 08:00:00 +0500</pubDate>
  <media:content url="https://example.com/i.jpg" medium="image"/>
</item>
<item>
  <title>Second story</title>
  <link>https://example.com/b</link>
  <content:encoded><![CDATA[<p>Long <img src="https://example.com/inline.png?a=1&amp;b=2"> body text that runs well past the teaser.</p>]]></content:encoded>
  <description>short description</description>
</item>
<item><title>No link here</title></item>
<item><link>https://example.com/no-title</link></item>
</channel></rss>`;

describe("parseFeedXml", () => {
  it("repairs a bare ampersand and normalizes items", async () => {
    const items = await parseFeedXml(RSS);
    assert.equal(items.length, 2, "items without a link or title are dropped");
    const [first, second] = items;
    assert.equal(first?.title, "Fresh & new story");
    assert.equal(first?.url, "https://example.com/a?utm_source=x&id=5");
    assert.equal(first?.snippet, "Hello world & more.");
    assert.equal(first?.imageUrl, "https://example.com/i.jpg");
    assert.equal(first?.publishedAt?.toISOString(), "2026-09-20T03:00:00.000Z");
    assert.equal(second?.publishedAt, null);
    assert.match(second?.snippet ?? "", /^Long\s+body text that runs well past the teaser\.$/, "prefers the richer <content:encoded> over the short <description>");
    assert.equal(second?.imageUrl, "https://example.com/inline.png?a=1&b=2", "falls back to the first <img> in the content");
  });

  it("sanitizeXml leaves valid entities alone", () => {
    assert.equal(sanitizeXml("a &amp; b &lt; c &#38; d &#x26; e & f"), "a &amp; b &lt; c &#38; d &#x26; e &amp; f");
  });
});

describe("fetchFeed", () => {
  let server: Server;
  let base: string;
  const seenAgents: (string | undefined)[] = [];
  const settings = { ...loadSettings({}), fetchTimeoutMs: 400 };

  before(async () => {
    server = createServer((req, res) => {
      seenAgents.push(req.headers["user-agent"]);
      if (req.url === "/ok") return void res.writeHead(200, { "content-type": "application/rss+xml" }).end(RSS);
      if (req.url === "/html") return void res.writeHead(200, { "content-type": "text/html" }).end("<!DOCTYPE html><html><body>hi</body></html>");
      if (req.url === "/garbage") return void res.writeHead(200).end("this is not xml at all");
      if (req.url === "/slow") return; // never responds
      res.writeHead(404).end("nope");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => {
    server.closeAllConnections();
    server.close();
  });

  it("fetches with the configured User-Agent", async () => {
    const items = await fetchFeed(`${base}/ok`, settings);
    assert.equal(items.length, 2);
    assert.match(seenAgents.at(-1) ?? "", /G12NewsBot/);
  });

  it("reports HTTP errors, HTML pages, unparseable bodies and timeouts as short errors", async () => {
    await assert.rejects(fetchFeed(`${base}/missing`, settings), /HTTP 404/);
    await assert.rejects(fetchFeed(`${base}/html`, settings), /HTML page, not a feed/);
    await assert.rejects(fetchFeed(`${base}/garbage`, settings), /could not parse feed/);
    await assert.rejects(fetchFeed(`${base}/slow`, settings), /timed out|aborted/i);
  });
});
