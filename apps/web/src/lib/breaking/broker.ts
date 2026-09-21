import { BREAKING_NOTIFY_CHANNEL } from "@g12/config";
import type { BreakingItem, StreamMessage } from "./types";

/**
 * Turns Postgres NOTIFYs into messages for every open browser connection.
 *
 * One dedicated database connection LISTENs on the breaking channel no matter how many browsers are
 * connected; each notification is looked up once and fanned out. The connection is opened when the
 * first browser subscribes, re-opened with back-off if it drops (browsers are told meanwhile that
 * the stream is not live, so they poll), and closed after a minute with no subscribers.
 */

/** The parts of a pg.Client this class needs; injectable so it can be tested without a database. */
export interface ListenClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<unknown>;
  on(event: "notification", listener: (message: { channel: string; payload?: string }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  end(): Promise<unknown>;
}

export interface BrokerDeps {
  createClient(): ListenClient;
  /** The story with this id, if it is currently breaking. */
  fetchItem(id: string): Promise<BreakingItem | null>;
  fetchSnapshot(): Promise<BreakingItem[] | null>;
  /** Called on every notification, e.g. to drop a cache. */
  onNotification?(): void;
  log?(message: string): void;
  timers?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

export type Listener = (message: StreamMessage) => void;

const IDLE_CLOSE_MS = 60_000;
const MAX_BACKOFF_MS = 30_000;

export class BreakingBroker {
  private readonly subscribers = new Set<Listener>();
  private readonly dead = new WeakSet<object>();
  private client: ListenClient | null = null;
  private connecting = false;
  private live = false;
  private retryMs = 1_000;
  private retryTimer: unknown = null;
  private idleTimer: unknown = null;
  private readonly timers: NonNullable<BrokerDeps["timers"]>;

  constructor(private readonly deps: BrokerDeps) {
    this.timers = deps.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  }

  /** True while the database connection is listening, i.e. pushes are reaching browsers. */
  isLive(): boolean {
    return this.live;
  }

  subscriberCount(): number {
    return this.subscribers.size;
  }

  subscribe(listener: Listener): () => void {
    this.subscribers.add(listener);
    if (this.idleTimer) {
      this.timers.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    void this.connect();
    return () => {
      this.subscribers.delete(listener);
      if (this.subscribers.size === 0 && !this.idleTimer) {
        this.idleTimer = this.timers.setTimeout(() => {
          this.idleTimer = null;
          if (this.subscribers.size === 0) this.close();
        }, IDLE_CLOSE_MS);
      }
    };
  }

  private emit(message: StreamMessage): void {
    for (const listener of [...this.subscribers]) {
      try {
        listener(message);
      } catch (error) {
        this.deps.log?.(`subscriber failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async connect(): Promise<void> {
    if (this.client || this.connecting) return;
    this.connecting = true;
    let client: ListenClient | undefined;
    try {
      client = this.deps.createClient();
      const current = client;
      current.on("notification", (message) => void this.onNotification(message));
      current.on("error", (error) => this.handleDown(current, error));
      current.on("end", () => this.handleDown(current));
      await current.connect();
      await current.query(`LISTEN ${BREAKING_NOTIFY_CHANNEL}`);
      if (this.dead.has(current)) return; // dropped while connecting; handleDown already scheduled a retry
      if (this.subscribers.size === 0) {
        this.dead.add(current);
        await current.end().catch(() => undefined);
        return;
      }
      this.client = current;
      this.live = true;
      this.retryMs = 1_000;
      this.emit({ event: "status", data: { live: true } });
      // Notifications sent while we were not listening are lost, so hand everyone a fresh list.
      const items = await this.deps.fetchSnapshot();
      if (items && this.client === current) this.emit({ event: "snapshot", data: { items } });
    } catch (error) {
      this.handleDown(client, error);
    } finally {
      this.connecting = false;
    }
  }

  private handleDown(client: ListenClient | undefined, error?: unknown): void {
    if (client) {
      if (this.dead.has(client)) return;
      this.dead.add(client);
      try {
        void client.end().catch(() => undefined);
      } catch {
        // already closed
      }
    }
    if (error) this.deps.log?.(`listener down: ${error instanceof Error ? error.message : error}`);
    if (!client || this.client === client) {
      const wasLive = this.live;
      this.client = null;
      this.live = false;
      if (wasLive) this.emit({ event: "status", data: { live: false } });
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.subscribers.size === 0) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(delay * 2, MAX_BACKOFF_MS);
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, delay);
  }

  private close(): void {
    if (this.retryTimer) {
      this.timers.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const client = this.client;
    this.client = null;
    this.live = false;
    if (client) {
      this.dead.add(client);
      void client.end().catch(() => undefined);
    }
  }

  private async onNotification(message: { channel: string; payload?: string }): Promise<void> {
    if (message.channel !== BREAKING_NOTIFY_CHANNEL || !message.payload) return;
    let payload: { id?: unknown; breaking?: unknown };
    try {
      payload = JSON.parse(message.payload) as { id?: unknown; breaking?: unknown };
    } catch {
      return;
    }
    if (typeof payload.id !== "string") return;
    this.deps.onNotification?.();
    if (payload.breaking === true) {
      const item = await this.deps.fetchItem(payload.id).catch(() => null);
      if (item) this.emit({ event: "breaking", data: { item } });
    } else {
      this.emit({ event: "removed", data: { id: payload.id } });
    }
  }
}
