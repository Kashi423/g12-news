import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { loadSettings } from "../settings";
import { cleanImageCredit, fetchFeed, parseFeedXml, sanitizeXml } from "./feed";

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

  it("stores working image URLs: Geo's feed leaves out the updates/ folder, and http images become https", async () => {
    const geo = `<?xml version="1.0"?><rss version="2.0"><channel><title>Geo</title>
<item><title>Two officers martyred</title><link>https://www.geo.tv/latest/682915-two</link>
<description><![CDATA[<img src="https://www.geo.tv/assets/uploads/2026-09-20/682915_091823_updates.jpg"/>]]><![CDATA[Security forces killed eight militants.]]></description></item>
<item><title>Old-style link</title><link>https://example.com/c</link><enclosure url="http://example.com/c.jpg" type="image/jpeg"/></item>
</channel></rss>`;
    const [first, second] = await parseFeedXml(geo);
    assert.equal(first?.imageUrl, "https://www.geo.tv/assets/uploads/updates/2026-09-20/682915_091823_updates.jpg");
    assert.equal(second?.imageUrl, "https://example.com/c.jpg");
  });

  it("reads the image credit from Media RSS, wherever the feed puts it", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>X</title>
<item><title>Item-level credit</title><link>https://example.com/1</link>
  <media:content url="https://example.com/1.jpg" medium="image"/><media:credit role="photographer" scheme="urn:ebu">AP Photo/Anjum Naveed</media:credit></item>
<item><title>Credit inside the media node</title><link>https://example.com/2</link>
  <media:content url="https://example.com/2.jpg" medium="image"><media:credit>Reuters</media:credit></media:content></item>
<item><title>Only a copyright line</title><link>https://example.com/3</link>
  <media:content url="https://example.com/3.jpg" medium="image"/><media:copyright>&#169; Getty Images</media:copyright></item>
<item><title>Label and spacing are tidied</title><link>https://example.com/4</link>
  <media:content url="https://example.com/4.jpg" medium="image"/><media:credit>  Photo:   Faisal   Mahmood / Reuters </media:credit></item>
<item><title>No credit at all</title><link>https://example.com/5</link><media:content url="https://example.com/5.jpg" medium="image"/></item>
<item><title>A credit but no picture</title><link>https://example.com/6</link><media:credit>Reuters</media:credit></item>
</channel></rss>`;
    const credits = (await parseFeedXml(xml)).map((item) => item.imageCredit);
    assert.deepEqual(credits, ["AP Photo/Anjum Naveed", "Reuters", "© Getty Images", "Faisal Mahmood / Reuters", null, null]);
  });

  it("cleanImageCredit drops placeholders and bare links, and caps the length", () => {
    for (const junk of ["", "  ", "N/A", "n/a", "None", "unknown", "-", "Photo:", "https://example.com/credit", "x"]) {
      assert.equal(cleanImageCredit(junk), null, JSON.stringify(junk));
    }
    assert.equal(cleanImageCredit("Credit: <b>Rehan Khan</b> &amp; Getty"), "Rehan Khan & Getty");
    assert.ok((cleanImageCredit("A".repeat(500))?.length ?? 999) <= 120);
  });

  it("finds The Express Tribune's picture, which sits in its own <image><img/></image> block", async () => {
    // Shape copied from tribune.com.pk/feed/latest (whitespace included).
    const tribune = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><channel><title>Tribune</title>
			<item>
			<title>Cops told about intellectual property</title>
			<link>https://tribune.com.pk/story/2630505/cops-told-about-intellectual-property</link>
			<pubDate>Mon, 21 Sep 26 02:24:56 +0500</pubDate>
			<description><![CDATA[An awareness workshop was organised at the Police Lines.]]></description>
			<image>
				    <img src="https://i.tribune.com.pk/media/images/intellectual-property-rights1789959021-0/intellectual-property-rights1789959021-0.jpg" class="featured_image"/>
            </image>
			</item><item>
			<title>A story with no picture at all</title>
			<link>https://tribune.com.pk/story/2630504/no-picture</link>
			<description>Plain text.</description>
			</item></channel></rss>`;
    const [withPicture, without] = await parseFeedXml(tribune);
    assert.equal(withPicture?.imageUrl, "https://i.tribune.com.pk/media/images/intellectual-property-rights1789959021-0/intellectual-property-rights1789959021-0.jpg");
    assert.equal(without?.imageUrl, null);
  });

  it("a standard media picture still wins over a wrapped one", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>X</title>
<item><title>Both kinds</title><link>https://example.com/1</link><media:content url="https://example.com/standard.jpg" medium="image"/><image><img src="https://example.com/wrapped.jpg"/></image></item>
<item><title>Unsafe wrapped picture</title><link>https://example.com/2</link><image><img src="javascript:alert(1)"/></image></item>
</channel></rss>`;
    const [both, unsafe] = await parseFeedXml(xml);
    assert.equal(both?.imageUrl, "https://example.com/standard.jpg");
    assert.equal(unsafe?.imageUrl, null, "only http(s) addresses are accepted");
  });

  it("decodes HTML entities that a feed puts inside CDATA (The Nation's style), not just numeric ones", async () => {
    const nation = `<?xml version="1.0"?><rss version="2.0"><channel><title>Nation</title>
<item><title>Bilawal pays tribute</title><link>https://www.nation.com.pk/21-Sep-2026/bilawal</link>
<description><![CDATA[ISLAMABAD  -  Pakistan People&rsquo;s Party (PPP) Chairman Bilawal Bhu&shy;tto said Khyber Pakh&shy;tunkhwa&nbsp;will vote&hellip; soon &amp; fairly.]]></description></item>
</channel></rss>`;
    const [item] = await parseFeedXml(nation);
    assert.equal(item?.snippet, "ISLAMABAD - Pakistan People’s Party (PPP) Chairman Bilawal Bhutto said Khyber Pakhtunkhwa will vote… soon & fairly.");
  });

  it("also repairs text that a feed escaped twice inside CDATA", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title><item><title>Twice</title><link>https://example.com/t</link><description><![CDATA[People&amp;rsquo;s voice &amp;amp; more &#173;joined]]></description></item></channel></rss>`;
    const [item] = await parseFeedXml(xml);
    assert.equal(item?.snippet, "People’s voice & more joined");
  });

  it("sanitizeXml leaves valid entities alone", () => {
    assert.equal(sanitizeXml("a &amp; b &lt; c &#38; d &#x26; e & f"), "a &amp; b &lt; c &#38; d &#x26; e &amp; f");
  });

  it("sanitizeXml repairs a bare & outside CDATA but never touches text inside it", () => {
    assert.equal(
      sanitizeXml("<t>Tom & Jerry &rsquo;</t><d><![CDATA[a & b &rsquo; c]]></d><u>x & y</u><d2><![CDATA[second &shy; block]]></d2>"),
      "<t>Tom &amp; Jerry &amp;rsquo;</t><d><![CDATA[a & b &rsquo; c]]></d><u>x &amp; y</u><d2><![CDATA[second &shy; block]]></d2>",
    );
    assert.equal(sanitizeXml("no cdata & here"), "no cdata &amp; here");
    assert.equal(sanitizeXml("<d><![CDATA[never closed & open"), "<d><![CDATA[never closed &amp; open", "an unterminated CDATA is not a CDATA section");
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
