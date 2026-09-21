import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAlerts, lastSuccess, type HealthSnapshot, type SourceHealth } from "./alerts";
import { planApproval } from "./approval";
import { adminConfig, adminConfigProblems, createSession, hashPassword, verifyPassword, verifySession, type AdminConfig } from "./auth";
import { createLimiter } from "./rate-limit";
import { ago, formatAge, formatPkt, pakistanDay } from "./time";
import { deriveExcerpt, validateEdit, validateSource } from "./validate";

const NOW = new Date("2026-09-21T10:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const hoursAgo = (h: number) => minutesAgo(h * 60);

describe("passwords and sessions", () => {
  it("accepts the right password and only that", () => {
    const stored = hashPassword("correct horse battery");
    assert.match(stored, /^scrypt:16384:8:1:[\w-]+:[\w-]+$/, "no dollar signs: Next.js would expand them inside .env");
    assert.equal(verifyPassword("correct horse battery", stored), true);
    assert.equal(verifyPassword("correct horse batter", stored), false);
    assert.equal(verifyPassword("", stored), false);
  });

  it("salts every hash, and treats a malformed hash as a wrong password rather than an error", () => {
    assert.notEqual(hashPassword("same"), hashPassword("same"));
    for (const bad of ["", "plain-text", "scrypt:::::", "scrypt:16384:8:1:abc", "bcrypt:1:2:3:4:5", "scrypt:99999999999:8:1:c2FsdA:aGFzaA"]) {
      assert.equal(verifyPassword("x", bad), false, bad);
    }
  });

  const config: AdminConfig = { email: "owner@example.com", passwordHash: hashPassword("pw"), secret: "s".repeat(40) };

  it("signs a session that verifies until it expires", () => {
    const token = createSession(config, NOW, 3600);
    assert.equal(verifySession(token, config, NOW), true);
    assert.equal(verifySession(token, config, new Date(NOW.getTime() + 3599_000)), true);
    assert.equal(verifySession(token, config, new Date(NOW.getTime() + 3600_000)), false, "expired");
  });

  it("rejects tampered, foreign and empty tokens", () => {
    const token = createSession(config, NOW, 3600);
    const [expires, sig] = token.split(".");
    assert.equal(verifySession(`${Number(expires) + 99999}.${sig}`, config, NOW), false, "the expiry cannot be extended");
    assert.equal(verifySession(`${expires}.${sig}x`, config, NOW), false);
    assert.equal(verifySession(`${expires}.${sig}.extra`, config, NOW), false);
    assert.equal(verifySession(undefined, config, NOW), false);
    assert.equal(verifySession("", config, NOW), false);
    assert.equal(verifySession("abc.def", config, NOW), false);
    assert.equal(verifySession(token, { ...config, secret: "t".repeat(40) }, NOW), false, "another secret");
    assert.equal(verifySession(token, { ...config, email: "someone@else.com" }, NOW), false, "another email");
    assert.equal(verifySession(token, { ...config, passwordHash: hashPassword("new password") }, NOW), false, "changing the password signs everyone out");
  });

  it("reads its settings from the environment and names what is missing", () => {
    assert.deepEqual(adminConfigProblems({}), ["ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "ADMIN_SESSION_SECRET (at least 32 characters)"]);
    assert.deepEqual(adminConfigProblems({ ADMIN_EMAIL: "a@b.c", ADMIN_PASSWORD_HASH: "x", ADMIN_SESSION_SECRET: "short" }), ["ADMIN_SESSION_SECRET (at least 32 characters)"]);
    assert.equal(adminConfig({ ADMIN_EMAIL: "a@b.c" }), null);
    assert.deepEqual(adminConfig({ ADMIN_EMAIL: " Owner@Example.com ", ADMIN_PASSWORD_HASH: "h", ADMIN_SESSION_SECRET: "s".repeat(32) }), { email: "owner@example.com", passwordHash: "h", secret: "s".repeat(32) });
  });
});

describe("login rate limit", () => {
  it("locks a client out after too many failures, then forgives", () => {
    const limiter = createLimiter({ maxFailures: 3, windowMs: 60_000, lockMs: 10 * 60_000 });
    for (let i = 0; i < 2; i++) limiter.fail("1.2.3.4", 1000);
    assert.equal(limiter.wait("1.2.3.4", 1000), 0);
    limiter.fail("1.2.3.4", 1000);
    assert.equal(limiter.wait("1.2.3.4", 1000), 10 * 60_000);
    assert.equal(limiter.wait("5.6.7.8", 1000), 0, "other clients are unaffected");
    assert.equal(limiter.wait("1.2.3.4", 1000 + 10 * 60_000), 0);
  });

  it("does not count failures that are outside the window, and a success clears them", () => {
    const limiter = createLimiter({ maxFailures: 3, windowMs: 60_000, lockMs: 60_000 });
    limiter.fail("k", 0);
    limiter.fail("k", 1000);
    limiter.fail("k", 120_000); // the first two have expired
    assert.equal(limiter.wait("k", 120_000), 0);
    limiter.fail("k", 120_001);
    limiter.reset("k");
    limiter.fail("k", 120_002);
    assert.equal(limiter.wait("k", 120_002), 0);
  });
});

describe("time helpers", () => {
  it("describes how long ago something was", () => {
    assert.equal(formatAge(20_000), "under a minute");
    assert.equal(formatAge(5 * 60_000), "5 min");
    assert.equal(formatAge(60 * 60_000), "1 h");
    assert.equal(formatAge(192 * 60_000), "3 h 12 min");
    assert.equal(formatAge(52 * 3_600_000), "2 d 4 h");
    assert.equal(ago(null, NOW), "never");
    assert.equal(ago(hoursAgo(3), NOW), "3 h ago");
  });

  it("finds the Pakistan day, which starts at 19:00 UTC the evening before", () => {
    assert.deepEqual(pakistanDay(new Date("2026-09-20T18:59:59Z")).ymd, "2026-09-20");
    const midnight = pakistanDay(new Date("2026-09-20T19:00:00Z"));
    assert.equal(midnight.ymd, "2026-09-21");
    assert.equal(midnight.start.toISOString(), "2026-09-20T19:00:00.000Z");
    assert.equal(pakistanDay(new Date("2026-09-21T10:00:00Z")).start.toISOString(), "2026-09-20T19:00:00.000Z");
  });

  it("prints times in Pakistan time", () => {
    assert.equal(formatPkt(new Date("2026-09-21T09:05:00Z")), "21 Sept, 14:05");
    assert.equal(formatPkt(null), "never");
  });
});

const source = (over: Partial<SourceHealth> = {}): SourceHealth => ({
  id: "s1",
  name: "Dawn — Pakistan",
  isActive: true,
  createdAt: hoursAgo(72),
  lastFetchedAt: minutesAgo(10),
  lastSuccessAt: minutesAgo(10),
  lastError: null,
  ...over,
});
const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  now: NOW,
  requireReview: false,
  sources: [source()],
  lastRunAt: minutesAgo(10),
  pendingCount: 0,
  stuckCount: 0,
  oldestPendingAt: null,
  ...over,
});

describe("alerts", () => {
  it("raises nothing for a healthy pipeline", () => {
    assert.deepEqual(computeAlerts(snapshot()), []);
  });

  it("works out the last success whichever worker version wrote the row", () => {
    assert.equal(lastSuccess({ lastFetchedAt: minutesAgo(5), lastSuccessAt: null, lastError: null })?.getTime(), minutesAgo(5).getTime(), "an attempt with no error is a success");
    assert.equal(lastSuccess({ lastFetchedAt: minutesAgo(5), lastSuccessAt: hoursAgo(3), lastError: "HTTP 500" })?.getTime(), hoursAgo(3).getTime(), "a failed attempt does not count");
    assert.equal(lastSuccess({ lastFetchedAt: minutesAgo(5), lastSuccessAt: null, lastError: "HTTP 500" }), null);
  });

  it("warns (red) when a source has not fetched successfully for over 2 hours, naming it and its error", () => {
    const alerts = computeAlerts(snapshot({
      sources: [source(), source({ id: "s2", name: "Geo News — Pakistan", lastFetchedAt: minutesAgo(10), lastSuccessAt: hoursAgo(3), lastError: "HTTP 503" })],
    }));
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.id, "sources-stale");
    assert.equal(alerts[0]!.level, "error");
    assert.match(alerts[0]!.title, /1 source has not fetched successfully in over 2 hours/);
    assert.match(alerts[0]!.items[0]!, /Geo News — Pakistan: last success 3 h ago \(HTTP 503\)/);
  });

  it("does not warn at exactly 2 hours, and gives a brand-new source 2 hours before calling it stale", () => {
    assert.deepEqual(computeAlerts(snapshot({ sources: [source({ lastSuccessAt: hoursAgo(2), lastFetchedAt: hoursAgo(2), lastError: "x" }), source({ id: "s2" })], lastRunAt: minutesAgo(1) })), []);
    const fresh = source({ id: "s3", createdAt: minutesAgo(30), lastFetchedAt: null, lastSuccessAt: null });
    assert.deepEqual(computeAlerts(snapshot({ sources: [source(), fresh] })), []);
    const old = source({ id: "s4", name: "Old feed", createdAt: hoursAgo(5), lastFetchedAt: null, lastSuccessAt: null });
    assert.match(computeAlerts(snapshot({ sources: [source(), old] }))[0]!.items[0]!, /Old feed: never fetched successfully \(added 5 h ago\)/);
  });

  it("ignores sources that are switched off", () => {
    assert.deepEqual(computeAlerts(snapshot({ sources: [source(), source({ id: "s2", isActive: false, lastSuccessAt: hoursAgo(30), lastFetchedAt: hoursAgo(30) })] })), []);
  });

  it("gives ONE banner, not one per source, when the whole pipeline has stopped", () => {
    const stale = (id: string) => source({ id, lastFetchedAt: hoursAgo(3), lastSuccessAt: hoursAgo(3) });
    const alerts = computeAlerts(snapshot({ sources: [stale("a"), stale("b"), stale("c")], lastRunAt: hoursAgo(3) }));
    assert.deepEqual(alerts.map((a) => [a.id, a.level]), [["pipeline-stopped", "error"]]);
    assert.match(alerts[0]!.title, /has not run for 3 h/);
  });

  it("reports a pipeline that has never run, and one with nothing switched on", () => {
    const never = computeAlerts(snapshot({ sources: [source({ lastFetchedAt: null, lastSuccessAt: null })], lastRunAt: null }));
    assert.equal(never[0]!.title, "The pipeline has never run");
    const none = computeAlerts(snapshot({ sources: [source({ isActive: false })] }));
    assert.equal(none[0]!.id, "no-sources");
  });

  it("warns about a review queue that is piling up, but only while review is on", () => {
    const stuck = { pendingCount: 6, stuckCount: 4, oldestPendingAt: hoursAgo(9) };
    const on = computeAlerts(snapshot({ requireReview: true, ...stuck }));
    assert.deepEqual(on.map((a) => [a.id, a.level]), [["review-stuck", "warning"]]);
    assert.match(on[0]!.title, /4 stories have been waiting for review for over 4 hours/);
    assert.match(on[0]!.detail, /oldest has waited 9 h/);
    assert.deepEqual(computeAlerts(snapshot({ requireReview: false, ...stuck })), []);
    assert.deepEqual(computeAlerts(snapshot({ requireReview: true, pendingCount: 3, stuckCount: 0, oldestPendingAt: hoursAgo(1) })), []);
  });

  it("can raise the red banner and the queue banner together", () => {
    const alerts = computeAlerts(snapshot({ requireReview: true, pendingCount: 1, stuckCount: 1, oldestPendingAt: hoursAgo(5), lastRunAt: hoursAgo(4), sources: [source({ lastFetchedAt: hoursAgo(4), lastSuccessAt: hoursAgo(4) })] }));
    assert.deepEqual(alerts.map((a) => a.id), ["pipeline-stopped", "review-stuck"]);
  });
});

describe("approval plan", () => {
  it("publishes at 'now' and keeps the original order of a bulk approval", () => {
    const plan = planApproval([
      { id: "b", publishedAt: minutesAgo(30), isBreaking: false },
      { id: "a", publishedAt: minutesAgo(90), isBreaking: false },
      { id: "c", publishedAt: minutesAgo(10), isBreaking: false },
    ], NOW);
    assert.deepEqual(plan.map((u) => u.id), ["a", "b", "c"]);
    assert.deepEqual(plan.map((u) => NOW.getTime() - u.publishedAt.getTime()), [2, 1, 0], "the newest gets exactly now, older ones a millisecond apart");
  });

  it("keeps the breaking flag only for a story that is still fresh, so a queued day-old story is not 'breaking' again", () => {
    const plan = planApproval([
      { id: "fresh", publishedAt: minutesAgo(20), isBreaking: true },
      { id: "stale", publishedAt: hoursAgo(9), isBreaking: true },
      { id: "plain", publishedAt: minutesAgo(20), isBreaking: false },
    ], NOW);
    const flags = Object.fromEntries(plan.map((u) => [u.id, u.isBreaking]));
    assert.deepEqual(flags, { fresh: true, stale: false, plain: false });
  });

  it("handles an empty selection", () => {
    assert.deepEqual(planApproval([], NOW), []);
  });
});

describe("form validation", () => {
  const good = { title: "  Council approves new budget  ", excerpt: "", body: "The council approved the annual budget on Monday after a long debate, with members from both sides voting in favour.", category: "PAKISTAN" };

  it("accepts a normal edit, trims it, and writes a teaser when the summary line is cleared", () => {
    const result = validateEdit(good);
    assert.ok(result.ok);
    assert.equal(result.value.title, "Council approves new budget");
    assert.match(result.value.excerpt, /^The council approved the annual budget/);
    assert.equal(result.value.category, "PAKISTAN");
  });

  it("rejects edits that would publish something broken", () => {
    assert.deepEqual(validateEdit({ ...good, title: "Hi" }), { ok: false, error: "The headline is too short." });
    assert.equal(validateEdit({ ...good, title: "x".repeat(301) }).ok, false);
    assert.equal(validateEdit({ ...good, body: "Too short." }).ok, false);
    assert.equal(validateEdit({ ...good, category: "SPACE" }).ok, false);
    assert.equal(validateEdit({ ...good, category: undefined }).ok, false);
    assert.equal(validateEdit({ ...good, excerpt: "y".repeat(301) }).ok, false);
  });

  it("cuts a long body into a teaser at a sentence end", () => {
    const body = `${"Word ".repeat(30).trim()}. Second sentence goes on for a good while longer than needed. ${"more ".repeat(60)}`;
    const teaser = deriveExcerpt(body);
    assert.ok(teaser.length <= 221);
    assert.ok(teaser.endsWith(".") || teaser.endsWith("…"));
  });

  it("accepts a feed address only when it is http(s)", () => {
    const ok = validateSource({ name: " Dawn — Business ", rssUrl: " https://www.dawn.com/feeds/business ", category: "BUSINESS", isActive: "on" });
    assert.deepEqual(ok, { ok: true, value: { name: "Dawn — Business", rssUrl: "https://www.dawn.com/feeds/business", category: "BUSINESS", isActive: true } });
    assert.equal(validateSource({ name: "X feed", rssUrl: "ftp://x.com/rss", category: "WORLD", isActive: true }).ok, false);
    assert.equal(validateSource({ name: "X feed", rssUrl: "javascript:alert(1)", category: "WORLD", isActive: true }).ok, false);
    assert.equal(validateSource({ name: "X feed", rssUrl: "not a url", category: "WORLD", isActive: true }).ok, false);
    assert.equal(validateSource({ name: "", rssUrl: "https://x.com/rss", category: "WORLD", isActive: true }).ok, false);
    assert.equal(validateSource({ name: "X feed", rssUrl: "https://x.com/rss", category: "NOPE", isActive: true }).ok, false);
    const off = validateSource({ name: "X feed", rssUrl: "https://x.com/rss", category: "WORLD" });
    assert.ok(off.ok);
    assert.equal(off.value.isActive, false, "an unchecked box means switched off");
  });
});
