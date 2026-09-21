import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { BreakingBroker, type BrokerDeps, type ListenClient } from "./broker";
import type { BreakingItem, StreamMessage } from "./types";

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

class FakeClient extends EventEmitter {
  queries: string[] = [];
  ended = false;
  constructor(private readonly failConnect = false) {
    super();
  }
  async connect() {
    if (this.failConnect) throw new Error("ECONNREFUSED");
  }
  async query(text: string) {
    this.queries.push(text);
  }
  async end() {
    this.ended = true;
  }
  notify(payload: unknown, channel = "breaking_articles") {
    this.emit("notification", { channel, payload: typeof payload === "string" ? payload : JSON.stringify(payload) });
  }
}

function fakeTimers() {
  let next = 1;
  const tasks = new Map<number, { fn: () => void; ms: number }>();
  return {
    setTimeout(fn: () => void, ms: number) {
      const handle = next++;
      tasks.set(handle, { fn, ms });
      return handle;
    },
    clearTimeout(handle: unknown) {
      tasks.delete(handle as number);
    },
    delays: () => [...tasks.values()].map((t) => t.ms),
    runNext() {
      const [handle, task] = tasks.entries().next().value as [number, { fn: () => void; ms: number }];
      tasks.delete(handle);
      task.fn();
    },
    count: () => tasks.size,
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(overrides: Partial<BrokerDeps> = {}) {
  const clients: FakeClient[] = [];
  const timers = fakeTimers();
  const fetched: string[] = [];
  let notified = 0;
  const broker = new BreakingBroker({
    createClient: () => {
      const client = new FakeClient(nextConnectFails > 0 && (nextConnectFails--, true));
      clients.push(client);
      return client as unknown as ListenClient;
    },
    fetchItem: async (id) => {
      fetched.push(id);
      return id.startsWith("gone") ? null : item(id);
    },
    fetchSnapshot: async () => [item("snap")],
    onNotification: () => void notified++,
    timers,
    ...overrides,
  });
  let nextConnectFails = 0;
  return {
    broker,
    clients,
    timers,
    fetched,
    notified: () => notified,
    failNextConnects: (n: number) => (nextConnectFails = n),
    listen() {
      const messages: StreamMessage[] = [];
      const unsubscribe = broker.subscribe((m) => messages.push(m));
      return { messages, unsubscribe };
    },
  };
}

describe("BreakingBroker", () => {
  it("opens one LISTEN connection for any number of subscribers, then reports live and sends a snapshot", async () => {
    const t = setup();
    const a = t.listen();
    const b = t.listen();
    const c = t.listen();
    await flush();

    assert.equal(t.clients.length, 1);
    assert.deepEqual(t.clients[0]!.queries, ["LISTEN breaking_articles"]);
    assert.equal(t.broker.isLive(), true);
    for (const s of [a, b, c]) assert.deepEqual(s.messages.map((m) => m.event), ["status", "snapshot"]);
    assert.deepEqual(a.messages[0], { event: "status", data: { live: true } });
  });

  it("looks a breaking notification up once and fans it out to everyone", async () => {
    const t = setup();
    const a = t.listen();
    const b = t.listen();
    await flush();
    a.messages.length = b.messages.length = 0;

    t.clients[0]!.notify({ id: "x1", breaking: true });
    await flush();

    assert.deepEqual(t.fetched, ["x1"]);
    assert.equal(t.notified(), 1);
    for (const s of [a, b]) assert.deepEqual(s.messages, [{ event: "breaking", data: { item: item("x1") } }]);
  });

  it("announces a story that stopped being breaking, without fetching it", async () => {
    const t = setup();
    const a = t.listen();
    await flush();
    a.messages.length = 0;
    t.clients[0]!.notify({ id: "x2", breaking: false });
    await flush();
    assert.deepEqual(a.messages, [{ event: "removed", data: { id: "x2" } }]);
    assert.deepEqual(t.fetched, []);
  });

  it("stays quiet for a story that is no longer currently breaking, and ignores junk", async () => {
    const t = setup();
    const a = t.listen();
    await flush();
    a.messages.length = 0;
    t.clients[0]!.notify({ id: "gone-1", breaking: true });
    t.clients[0]!.notify("not json");
    t.clients[0]!.notify({ nope: true });
    t.clients[0]!.notify({ id: "x3", breaking: true }, "some_other_channel");
    await flush();
    assert.deepEqual(a.messages, []);
  });

  it("tells subscribers when the connection drops, reconnects, and resyncs them", async () => {
    const t = setup();
    const a = t.listen();
    await flush();
    a.messages.length = 0;

    t.clients[0]!.emit("error", new Error("connection reset"));
    t.clients[0]!.emit("end"); // pg reports both; must count as one drop
    await flush();
    assert.equal(t.broker.isLive(), false);
    assert.deepEqual(a.messages, [{ event: "status", data: { live: false } }]);
    assert.deepEqual(t.timers.delays(), [1000]);
    assert.equal(t.clients[0]!.ended, true);

    a.messages.length = 0;
    t.timers.runNext();
    await flush();
    assert.equal(t.clients.length, 2);
    assert.equal(t.broker.isLive(), true);
    assert.deepEqual(a.messages.map((m) => m.event), ["status", "snapshot"]);
  });

  it("keeps retrying with growing back-off while the database is unreachable", async () => {
    const t = setup();
    t.failNextConnects(3);
    const a = t.listen();
    await flush();
    assert.equal(t.broker.isLive(), false);
    assert.deepEqual(a.messages, [], "never live, so nothing to announce");

    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      delays.push(...t.timers.delays());
      t.timers.runNext();
      await flush();
    }
    assert.deepEqual(delays, [1000, 2000, 4000]);
    assert.equal(t.clients.length, 4);
    assert.equal(t.broker.isLive(), true, "the fourth attempt succeeded");
  });

  it("survives createClient throwing (for example DATABASE_URL not set)", async () => {
    const t = setup({
      createClient: () => {
        throw new Error("DATABASE_URL is not set");
      },
    });
    t.listen();
    await flush();
    assert.equal(t.broker.isLive(), false);
    assert.equal(t.timers.count(), 1, "a retry is scheduled");
  });

  it("closes the connection a minute after the last subscriber leaves, and reopens on the next", async () => {
    const t = setup();
    const a = t.listen();
    await flush();
    a.unsubscribe();
    assert.deepEqual(t.timers.delays(), [60_000]);
    t.timers.runNext();
    assert.equal(t.clients[0]!.ended, true);
    assert.equal(t.broker.isLive(), false);

    t.listen();
    await flush();
    assert.equal(t.clients.length, 2);
    assert.equal(t.broker.isLive(), true);
  });

  it("does not close if someone subscribes before the idle timer fires", async () => {
    const t = setup();
    const a = t.listen();
    await flush();
    a.unsubscribe();
    t.listen();
    assert.equal(t.timers.count(), 0, "the idle timer was cancelled");
    assert.equal(t.clients[0]!.ended, false);
  });

  it("does not let one broken subscriber stop the others", async () => {
    const t = setup();
    t.broker.subscribe(() => {
      throw new Error("boom");
    });
    const good = t.listen();
    await flush();
    good.messages.length = 0;
    t.clients[0]!.notify({ id: "x9", breaking: true });
    await flush();
    assert.equal(good.messages.length, 1);
  });
});
