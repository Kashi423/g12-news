import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSensitiveCategory, isSensitiveStory, looksSensitive } from "./sensitivity";

describe("isSensitiveCategory", () => {
  it("flags politics and health, not the others", () => {
    assert.equal(isSensitiveCategory("POLITICS"), true);
    assert.equal(isSensitiveCategory("HEALTH"), true);
    assert.equal(isSensitiveCategory("SPORTS"), false);
    assert.equal(isSensitiveCategory("PAKISTAN"), false);
  });
});

describe("looksSensitive", () => {
  it("flags crime, death and disaster language", () => {
    for (const text of ["Blast kills three near market", "Suspect arrested in murder case", "Earthquake flattens village", "Flooding displaces thousands"]) {
      assert.equal(looksSensitive(text), true, text);
    }
  });
  it("leaves routine stories alone", () => {
    for (const text of ["Council approves new budget", "Rain forecast for Punjab this week", "Pakistan beat India by 5 wickets", "Sindh opens digital classrooms"]) {
      assert.equal(looksSensitive(text), false, text);
    }
  });
});

describe("isSensitiveStory", () => {
  it("is true for a sensitive category even with mundane text", () => {
    assert.equal(isSensitiveStory("POLITICS", "Cabinet meets on Thursday"), true);
  });
  it("is true for sensitive text even in a non-sensitive category", () => {
    assert.equal(isSensitiveStory("PAKISTAN", "Blast kills three near market"), true);
  });
  it("checks every text argument given", () => {
    assert.equal(isSensitiveStory("PAKISTAN", "Council approves new budget", "A bomb exploded near the site"), true);
  });
  it("is false when neither the category nor any text is sensitive", () => {
    assert.equal(isSensitiveStory("SPORTS", "Pakistan beat India by 5 wickets", "A thrilling finish."), false);
  });
});
