import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crossSourceVerify, validateClaims } from "./verification";

describe("crossSourceVerify", () => {
  it("calls a single source unverified: single-source, no conflicts", () => {
    const result = crossSourceVerify([{ sourceName: "Dawn", title: "Blast kills three in Quetta market", description: "Three people died when a bomb exploded." }]);
    assert.deepEqual(result, { sourceCount: 1, agreement: "single-source", conflicts: [] });
  });

  it("confirms two sources that agree", () => {
    const result = crossSourceVerify([
      { sourceName: "Dawn", title: "Blast kills 3 in Quetta market", description: "3 people died and 5 were injured when a bomb exploded near a market on Monday." },
      { sourceName: "Geo News", title: "Bomb blast in Quetta market kills 3", description: "Officials said 3 people were killed and 5 wounded in a market bombing on Monday." },
    ]);
    assert.equal(result.sourceCount, 2);
    assert.equal(result.agreement, "confirmed");
    assert.deepEqual(result.conflicts, []);
  });

  // The conflict check compares digit figures (see numbersIn in verification.ts); spelled-out
  // numbers ("three") are not recognized, so these fixtures deliberately use digits.
  it("flags a numeric conflict between two sources describing the same event", () => {
    const result = crossSourceVerify([
      { sourceName: "Dawn", title: "Blast kills 3 in Quetta market", description: "3 people died when a bomb exploded near a market on Monday." },
      { sourceName: "Geo News", title: "Blast kills 5 in Quetta market", description: "5 people were killed in a market bombing on Monday." },
    ]);
    assert.equal(result.agreement, "conflicting");
    assert.equal(result.conflicts.length, 1);
    assert.match(result.conflicts[0]!, /Dawn gives 3/);
    assert.match(result.conflicts[0]!, /Geo News gives 5/);
  });

  it("does not manufacture a conflict between two unrelated stories that both contain numbers", () => {
    const result = crossSourceVerify([
      { sourceName: "Dawn", title: "Council approves new budget of 5 billion rupees", description: "The city council approved a new annual budget." },
      { sourceName: "Geo News", title: "Pakistan beat India by 5 wickets", description: "Pakistan won the match by 5 wickets in Karachi." },
    ]);
    assert.equal(result.agreement, "confirmed");
    assert.deepEqual(result.conflicts, []);
  });
});

describe("validateClaims", () => {
  // Digits, not spelled-out numbers: see the note on the numeric-conflict fixtures above.
  const sources = [{ sourceName: "Dawn", title: "Blast kills 3 in Quetta market", description: "3 people died and 5 were injured when a bomb exploded near a crowded market on Monday evening, police said." }];

  it("marks a sentence supported when its wording and numbers appear in the source", () => {
    const claims = validateClaims("A bomb exploded near a crowded market in Quetta on Monday, killing 3 people and injuring 5 others.", sources);
    assert.ok(claims.length > 0);
    assert.equal(claims[0]!.status, "supported");
    assert.equal(claims[0]!.corroboratingSources, 1);
  });

  it("marks a sentence with a contradicting number as conflicting", () => {
    const claims = validateClaims("The explosion at the Quetta market killed 10 people, according to witnesses.", sources);
    assert.equal(claims[0]!.status, "conflicting");
  });

  it("marks a sentence with no relation to any source as unsupported", () => {
    const claims = validateClaims("The president is expected to visit the region next week to review reconstruction efforts.", sources);
    assert.equal(claims[0]!.status, "unsupported");
  });

  it("ignores fragments too short to judge", () => {
    assert.deepEqual(validateClaims("Yes. No. Ok.", sources), []);
  });
});
