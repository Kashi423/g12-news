import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeImageUrl } from "./image-url";

describe("normalizeImageUrl", () => {
  it("upgrades http to https and keeps the rest of the URL", () => {
    assert.equal(normalizeImageUrl("http://p.imgci.com/db/PICTURES/CMS/420500/420523.jpg"), "https://p.imgci.com/db/PICTURES/CMS/420500/420523.jpg");
    assert.equal(normalizeImageUrl("https://i.dawn.com/large/x.webp?w=1"), "https://i.dawn.com/large/x.webp?w=1");
  });

  it("swaps BBC's 240px thumbnails for the 976px version", () => {
    assert.equal(
      normalizeImageUrl("https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/78b8/live/x.jpg"),
      "https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/78b8/live/x.jpg",
    );
  });

  it("adds the missing updates/ folder to Geo News image URLs", () => {
    assert.equal(
      normalizeImageUrl("https://www.geo.tv/assets/uploads/2026-09-20/682915_091823_updates.jpg"),
      "https://www.geo.tv/assets/uploads/updates/2026-09-20/682915_091823_updates.jpg",
    );
    assert.equal(
      normalizeImageUrl("http://www.geo.tv/assets/uploads/2026-09-20/682915_091823_updates.jpg"),
      "https://www.geo.tv/assets/uploads/updates/2026-09-20/682915_091823_updates.jpg",
    );
  });

  it("leaves already-correct Geo URLs alone, so applying it twice changes nothing", () => {
    const good = "https://www.geo.tv/assets/uploads/updates/2026-09-20/682915_091823_updates.jpg";
    assert.equal(normalizeImageUrl(good), good);
    const once = normalizeImageUrl("https://www.geo.tv/assets/uploads/2026-09-20/x.jpg");
    assert.equal(normalizeImageUrl(once), once);
  });

  it("does not touch other Geo paths or other hosts' /assets/uploads/ paths", () => {
    assert.equal(normalizeImageUrl("https://www.geo.tv/assets/uploads/logo.png"), "https://www.geo.tv/assets/uploads/logo.png");
    assert.equal(normalizeImageUrl("https://example.com/assets/uploads/2026-09-20/x.jpg"), "https://example.com/assets/uploads/2026-09-20/x.jpg");
  });

  it("rejects anything that is not an http(s) URL", () => {
    assert.equal(normalizeImageUrl("javascript:alert(1)"), null);
    assert.equal(normalizeImageUrl("data:image/png;base64,AAAA"), null);
    assert.equal(normalizeImageUrl("not a url"), null);
    assert.equal(normalizeImageUrl(""), null);
    assert.equal(normalizeImageUrl(null), null);
    assert.equal(normalizeImageUrl(undefined), null);
  });
});
