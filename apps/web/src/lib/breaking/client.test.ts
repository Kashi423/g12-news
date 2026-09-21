import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BreakingClient, POLL_MS, POLL_URL, RECONCILE_MS, STATUS_GRACE_MS, STREAM_RETRY_MS, STREAM_URL, WATCHDOG_MS, type ClientDeps, type EventSourceLike } from "./client";
import type { BreakingAction } from "./state";
import type { BreakingItem, BreakingMode } from "./types";

const item = (id: string): BreakingItem => ({
  id,
  slug: `story-${id}`,
  title: `Story ${id}`,
  excerpt: "e",
  category: "PAKISTAN",
  sourceName: "Dawn",
  publishedAt: "2026-09-21T11:50:00.000Z",
  urgencyScore: 8,
});

class FakeEventSource implements EventSourceLike {
  readyState = 0;
  closed = false;
  private handlers = new Map<string, ((e: { data?: string }) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (e: { data?: string }) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type: string, data?: unknown) {
    for (const h of this.handlers.get(type) ?? []) h({ data: data === undefined ? undefined : JSON.stringify(data) });
  }
  /** Simulate a connection error; the browser is auto-reconnecting unless `closedForGood`. */
  fail(closedForGood = false) {
    this.readyState = closedForGood ? 2 : 0;
    this.emit("error");
  }
}

class FakeClock {
  t = 1_000_000;
  private tasks: { id: number; at: number; fn: () => void; every?: number }[] = [];
  private next = 1;
  now = () => this.t;
  private add(fn: () => void, ms: number, every?: number) {
    const id = this.next++;
    this.tasks.push({ id, at: this.t + ms, fn, every });
    return id;
  }
  setTimeout = (fn: () => void, ms: number) => this.add(fn, ms);
  setInterval = (fn: () => void, ms: number) => this.add(fn, ms, ms);
  clearTimeout = (id: unknown) => void (this.tasks = this.tasks.filter((x) => x.id !== id));
  clearInterval = this.clearTimeout;
  pendingTimers = () => this.tasks.length;
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.tasks.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = due.at;
      if (due.every) due.at += due.every;
      else this.tasks = this.tasks.filter((x) => x.id !== due.id);
      due.fn();
    }
    this.t = end;
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(opts: { eventSource?: boolean; pollResponse?: () => { ok: boolean; body?: unknown } | Error } = {}) {
  const clock = new FakeClock();
  const sources: FakeEventSource[] = [];
  const actions: BreakingAction[] = [];
  const modes: BreakingMode[] = [];
  const fetches: string[] = [];
  let respond = opts.pollResponse ?? (() => ({ ok: true, body: { items: [item("polled")] } }));
  const deps: ClientDeps = {
    createEventSource: opts.eventSource === false ? undefined : (url) => {
      const source = new FakeEventSource(url);
      sources.push(source);
      return source;
    },
    fetch: async (url) => {
      fetches.push(url);
      const r = respond();
      if (r instanceof Error) throw r;
      return { ok: r.ok, json: async () => r.body };
    },
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    onAction: (a) => actions.push(a),
    onMode: (m) => modes.push(m),
  };
  const client = new BreakingClient(deps);
  return { client, clock, sources, actions, modes, fetches, setResponse: (fn: typeof respond) => (respond = fn), current: () => sources.at(-1)! };
}

describe("BreakingClient: live stream", () => {
  it("opens the stream, turns stream messages into actions, and does not poll", async () => {
    const t = setup();
    t.client.start();
    assert.equal(t.sources.length, 1);
    assert.equal(t.current().url, STREAM_URL);
    assert.deepEqual(t.modes, [], "starts in 'connecting' with no change to report");

    t.current().emit("status", { live: true });
    t.current().emit("snapshot", { items: [item("a")] });
    t.current().emit("breaking", { item: item("b") });
    t.current().emit("removed", { id: "a" });
    t.current().emit("ping", { t: 1 });

    assert.deepEqual(t.modes, ["stream"]);
    assert.deepEqual(t.actions.map((a) => a.type), ["snapshot", "upsert", "remove"]);
    assert.deepEqual(t.actions[1], { type: "upsert", item: item("b"), now: t.clock.now() });
    t.clock.advance(60_000);
    assert.deepEqual(t.fetches, [], "no polling while the stream is healthy");
  });

  it("ignores malformed events", () => {
    const t = setup();
    t.client.start();
    t.current().emit("breaking", "not-an-object-with-item");
    t.current().emit("snapshot", { items: "nope" });
    assert.equal(t.actions.length, 0);
  });

  it("reconciles with a slow poll every 2 minutes even while streaming", async () => {
    const t = setup();
    t.client.start();
    t.current().emit("status", { live: true });
    t.clock.advance(RECONCILE_MS);
    await flush();
    assert.deepEqual(t.fetches, [POLL_URL]);
    assert.equal(t.actions.at(-1)?.type, "snapshot");
  });
});

describe("BreakingClient: polling fallback", () => {
  it("polls every 30 seconds when the browser has no EventSource", async () => {
    const t = setup({ eventSource: false });
    t.client.start();
    await flush();
    assert.deepEqual(t.modes, ["polling"]);
    assert.equal(t.fetches.length, 1, "one immediate poll");
    t.clock.advance(POLL_MS);
    await flush();
    t.clock.advance(POLL_MS);
    await flush();
    assert.equal(t.fetches.length, 3);
    assert.equal(t.sources.length, 0);
  });

  it("does not start polling for a not-live status that turns live within the grace period", async () => {
    const t = setup();
    t.client.start();
    t.current().emit("status", { live: false }); // server's listener still connecting
    t.clock.advance(STATUS_GRACE_MS - 1_000);
    t.current().emit("status", { live: true });
    t.clock.advance(STATUS_GRACE_MS * 3);
    await flush();
    assert.deepEqual(t.modes, ["stream"]);
    assert.deepEqual(t.fetches, []);
  });

  it("polls when the server keeps saying it cannot push, and stops once it can", async () => {
    const t = setup();
    t.client.start();
    t.current().emit("status", { live: false });
    t.clock.advance(STATUS_GRACE_MS);
    await flush();
    assert.deepEqual(t.modes, ["polling"]);
    assert.equal(t.fetches.length, 1);
    t.clock.advance(POLL_MS);
    await flush();
    assert.equal(t.fetches.length, 2);

    t.current().emit("status", { live: true });
    assert.deepEqual(t.modes, ["polling", "stream"]);
    t.clock.advance(POLL_MS * 2);
    await flush();
    assert.equal(t.fetches.length, 2, "fast polling stopped");
  });

  it("falls back to polling after three failures in a row, then retries the stream after 5 minutes", async () => {
    const t = setup();
    t.client.start();
    t.current().fail();
    t.current().fail();
    assert.deepEqual(t.modes, [], "two blips are tolerated");
    t.current().fail();
    await flush();
    assert.deepEqual(t.modes, ["polling"]);
    assert.equal(t.sources[0]!.closed, true);
    assert.equal(t.fetches.length, 1);

    t.clock.advance(STREAM_RETRY_MS);
    assert.equal(t.sources.length, 2, "the stream is tried again");
    t.current().emit("status", { live: true });
    assert.deepEqual(t.modes, ["polling", "stream"]);
  });

  it("falls back at once when the browser gives up on the stream (readyState CLOSED)", async () => {
    const t = setup();
    t.client.start();
    t.current().fail(true);
    await flush();
    assert.deepEqual(t.modes, ["polling"]);
  });

  it("does not count a blip that recovered", () => {
    const t = setup();
    t.client.start();
    t.current().fail();
    t.current().fail();
    t.current().emit("ping", {});
    t.current().fail();
    t.current().fail();
    assert.deepEqual(t.modes, [], "the counter was reset by the ping");
  });

  it("treats a silent stream as dead: reopens it, then gives up for polling", async () => {
    const t = setup();
    t.client.start();
    t.current().emit("status", { live: true });

    t.clock.advance(WATCHDOG_MS + 20_000);
    assert.equal(t.sources.length, 2, "reopened after the first silence");
    assert.equal(t.sources[0]!.closed, true);

    t.clock.advance(WATCHDOG_MS + 20_000);
    assert.equal(t.sources.length, 3);
    t.clock.advance(WATCHDOG_MS + 20_000);
    await flush();
    assert.equal(t.modes.at(-1), "polling");
  });

  it("keeps the current list when a poll fails or the server answers 503", async () => {
    const t = setup({ eventSource: false, pollResponse: () => ({ ok: false }) });
    t.client.start();
    await flush();
    assert.equal(t.actions.length, 0);
    t.setResponse(() => new Error("offline"));
    t.clock.advance(POLL_MS);
    await flush();
    assert.equal(t.actions.length, 0);
    t.setResponse(() => ({ ok: true, body: { items: [item("back")] } }));
    t.clock.advance(POLL_MS);
    await flush();
    assert.deepEqual(t.actions.map((a) => a.type), ["snapshot"]);
  });

  it("never runs two polls at once", async () => {
    const t = setup({ eventSource: false });
    t.client.start();
    void t.client.pollNow();
    void t.client.pollNow();
    await flush();
    assert.equal(t.fetches.length, 1);
  });
});

describe("BreakingClient: stop", () => {
  it("closes the stream, clears every timer and stops dispatching", async () => {
    const t = setup();
    t.client.start();
    t.current().emit("status", { live: false });
    await flush();
    t.client.stop();
    assert.equal(t.sources[0]!.closed, true);
    assert.equal(t.clock.pendingTimers(), 0);
    const before = t.actions.length;
    t.current().emit("breaking", { item: item("late") });
    await t.client.pollNow();
    assert.equal(t.actions.length, before);
  });
});
