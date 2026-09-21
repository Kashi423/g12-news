import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORIES, CATEGORY_BY_ID, CATEGORY_BY_SLUG, CATEGORY_IDS, categoryBySlug } from "./categories";

describe("categories", () => {
  it("defines all nine categories, in display order, with a unique URL slug each", () => {
    assert.equal(CATEGORIES.length, 9);
    assert.deepEqual(CATEGORIES.map((c) => c.id), [...CATEGORY_IDS]);
    assert.equal(new Set(CATEGORIES.map((c) => c.slug)).size, 9);
    for (const c of CATEGORIES) assert.match(c.slug, /^[a-z]+$/, `${c.id} slug`);
  });

  it("looks categories up by id and by slug", () => {
    assert.equal(CATEGORY_BY_ID.SPORTS.slug, "sports");
    assert.equal(CATEGORY_BY_SLUG["miscellaneous"]?.id, "MISCELLANEOUS");
    assert.equal(CATEGORY_BY_SLUG["nope"], undefined);
    assert.equal(categoryBySlug("sports")?.name, "Sports");
    assert.equal(categoryBySlug("nope"), undefined);
    // Object.prototype members must never look like categories.
    for (const slug of ["constructor", "__proto__", "toString", "hasOwnProperty", ""]) assert.equal(categoryBySlug(slug), undefined, slug);
  });

  it("gives every category a one-line reader-facing tagline, separate from the AI description", () => {
    for (const c of CATEGORIES) {
      assert.ok(c.tagline.length >= 20, `${c.id} tagline is too short`);
      assert.ok(c.tagline.length <= 90, `${c.id} tagline is too long for one line: ${c.tagline.length}`);
      assert.ok(!/[\r\n]/.test(c.tagline), `${c.id} tagline spans lines`);
      assert.ok(!/[.!?]$/.test(c.tagline), `${c.id} tagline should have no trailing punctuation (it is spliced into a sentence)`);
      assert.notEqual(c.tagline, c.description);
    }
  });

  it("uses the agreed wording for Sports", () => {
    assert.equal(CATEGORY_BY_ID.SPORTS.tagline, "Cricket, football, and every other game Pakistan follows");
  });
});
