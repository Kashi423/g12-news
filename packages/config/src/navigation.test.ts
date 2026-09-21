import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categoryPath, HOMEPAGE_SECTIONS, PRIMARY_NAV_CATEGORIES, SITE_PAGES } from "./navigation";

describe("navigation", () => {
  it("lists the main nav in the agreed order", () => {
    assert.deepEqual(PRIMARY_NAV_CATEGORIES.map((c) => c.name), ["Pakistan", "World", "Politics", "Business", "Sports", "Showbiz", "Technology", "Health"]);
  });

  it("lists the homepage sections in the agreed order", () => {
    assert.deepEqual(HOMEPAGE_SECTIONS.map((c) => c.name), ["Pakistan", "World", "Sports", "Business", "Showbiz", "Technology", "Health"]);
  });

  it("builds category URLs from slugs", () => {
    assert.equal(categoryPath("pakistan"), "/category/pakistan");
    assert.deepEqual(PRIMARY_NAV_CATEGORIES.map((c) => categoryPath(c.slug))[0], "/category/pakistan");
  });

  it("links the four footer pages", () => {
    assert.deepEqual(SITE_PAGES.map((p) => p.label), ["About", "Contact", "Privacy", "Disclaimer"]);
  });
});
