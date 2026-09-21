import type { BreakingAction } from "./state";
import type { BreakingItem, BreakingMode } from "./types";

/**
 * Keeps the browser's breaking list live.
 *
 * Primary: Server-Sent Events from /api/breaking-stream (a story appears within a second or two).
 * Fallback: polling /api/breaking every 30 s, used when the browser has no EventSource, the stream
 * keeps failing or goes silent, or the server reports it cannot receive database notifications.
 * Even while streaming, a slow reconcile poll (every 2 min) catches anything a stream could miss.
 */

export const STREAM_URL = "/api/breaking-stream";
export const POLL_URL = "/api/breaking";
export const POLL_MS = 30_000;
export const RECONCILE_MS = 120_000;
/** The server pings every 20 s; if nothing at all arrives for this long, the stream is considered dead. */
export const WATCHDOG_MS = 70_000;
const WATCHDOG_CHECK_MS = 15_000;
/** After giving up on the stream, try it again this much later. */
export const STREAM_RETRY_MS = 5 * 60_000;
/**
 * The first `status` a fresh server connection sends can say "not live" for a moment while the
 * server's database listener is still connecting. Only start polling if it is still not live after this.
 */
export const STATUS_GRACE_MS = 5_000;
const MAX_CONSECUTIVE_ERRORS = 3;
const CLOSED = 2; // EventSource.CLOSED

/** The slice of EventSource this class uses. */
export interface EventSourceLike {
  readyState: number;
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
}

export interface ClientDeps {
  /** Undefined when the browser has no EventSource: polling only. */
  createEventSource?: (url: string) => EventSourceLike;
  fetch: (url: string, init?: { cache?: "no-store" }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  now: () => number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  onAction(action: BreakingAction): void;
  onMode(mode: BreakingMode): void;
}

const STREAM_EVENTS = ["snapshot", "breaking", "removed", "status", "ping"] as const;

export class BreakingClient {
  private es: EventSourceLike | null = null;
  private mode: BreakingMode = "connecting";
  /** Whether the server says it can push (null until the first `status` event). */
  private streamLive: boolean | null = null;
  private errorsInARow = 0;
  private lastEventAt = 0;
  private polling = false;
  private stopped = false;
  private pollTimer: unknown = null;
  private reconcileTimer: unknown = null;
  private watchdogTimer: unknown = null;
  private retryTimer: unknown = null;
  private graceTimer: unknown = null;

  constructor(private readonly deps: ClientDeps) {}

  start(): void {
    this.reconcileTimer = this.deps.setInterval(() => {
      if (!this.pollTimer) void this.pollNow(); // fast polling already covers it
    }, RECONCILE_MS);
    if (!this.deps.createEventSource) return this.enterPolling(false);
    this.openStream();
  }

  stop(): void {
    this.stopped = true;
    this.closeStream();
    for (const timer of [this.pollTimer, this.reconcileTimer, this.watchdogTimer]) if (timer) this.deps.clearInterval(timer);
    for (const timer of [this.retryTimer, this.graceTimer]) if (timer) this.deps.clearTimeout(timer);
    this.pollTimer = this.reconcileTimer = this.watchdogTimer = this.retryTimer = this.graceTimer = null;
  }

  /** Fetch the current list now (also called when a background tab becomes visible again). */
  async pollNow(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      const response = await this.deps.fetch(POLL_URL, { cache: "no-store" });
      if (!response.ok) return; // e.g. 503 while the database is down: keep what we have
      const body = (await response.json()) as { items?: BreakingItem[] };
      if (Array.isArray(body.items) && !this.stopped) this.deps.onAction({ type: "snapshot", items: body.items, now: this.deps.now() });
    } catch {
      // offline or a network blip: try again next time
    } finally {
      this.polling = false;
    }
  }

  private setMode(mode: BreakingMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.deps.onMode(mode);
  }

  private openStream(): void {
    if (this.stopped || !this.deps.createEventSource) return;
    this.closeStream();
    let es: EventSourceLike;
    try {
      es = this.deps.createEventSource(STREAM_URL);
    } catch {
      return this.enterPolling(true);
    }
    this.es = es;
    this.streamLive = null;
    this.lastEventAt = this.deps.now();
    if (this.mode !== "polling") this.setMode("connecting");

    for (const type of STREAM_EVENTS) es.addEventListener(type, (event) => this.onStreamEvent(type, event.data));
    es.addEventListener("error", () => this.onStreamError(es));
    if (!this.watchdogTimer) this.watchdogTimer = this.deps.setInterval(() => this.checkWatchdog(), WATCHDOG_CHECK_MS);
  }

  private closeStream(): void {
    this.es?.close();
    this.es = null;
    this.streamLive = null;
    this.cancelGrace();
  }

  private cancelGrace(): void {
    if (this.graceTimer) this.deps.clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  private onStreamEvent(type: (typeof STREAM_EVENTS)[number], data: string | undefined): void {
    if (this.stopped) return;
    this.errorsInARow = 0;
    this.lastEventAt = this.deps.now();
    if (type === "ping" || !data) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    const now = this.deps.now();
    if (type === "snapshot" && Array.isArray(payload.items)) this.deps.onAction({ type: "snapshot", items: payload.items as BreakingItem[], now });
    else if (type === "breaking" && payload.item) this.deps.onAction({ type: "upsert", item: payload.item as BreakingItem, now });
    else if (type === "removed" && typeof payload.id === "string") this.deps.onAction({ type: "remove", id: payload.id });
    else if (type === "status") {
      this.streamLive = payload.live === true;
      this.applyStreamStatus();
    }
  }

  /** Stream healthy and the server can push -> no fast polling. Otherwise poll every 30 s. */
  private applyStreamStatus(): void {
    if (this.streamLive) {
      this.cancelGrace();
      if (this.pollTimer) this.deps.clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.setMode("stream");
      return;
    }
    if (this.graceTimer) return;
    this.graceTimer = this.deps.setTimeout(() => {
      this.graceTimer = null;
      if (this.stopped || this.streamLive !== false) return;
      this.startFastPolling();
      this.setMode("polling");
    }, STATUS_GRACE_MS);
  }

  private onStreamError(source: EventSourceLike): void {
    if (this.stopped || source !== this.es) return;
    this.errorsInARow++;
    // CLOSED: the browser gave up. Otherwise it is auto-reconnecting; allow a few failures in a row.
    if (source.readyState === CLOSED || this.errorsInARow >= MAX_CONSECUTIVE_ERRORS) {
      this.closeStream();
      this.enterPolling(true);
    }
  }

  private checkWatchdog(): void {
    if (this.stopped || !this.es) return;
    if (this.deps.now() - this.lastEventAt <= WATCHDOG_MS) return;
    this.errorsInARow++;
    this.closeStream();
    if (this.errorsInARow >= MAX_CONSECUTIVE_ERRORS) this.enterPolling(true);
    else this.openStream();
  }

  private startFastPolling(): void {
    if (this.pollTimer || this.stopped) return;
    this.pollTimer = this.deps.setInterval(() => void this.pollNow(), POLL_MS);
    void this.pollNow();
  }

  private enterPolling(retryStream: boolean): void {
    this.setMode("polling");
    this.startFastPolling();
    if (retryStream && !this.retryTimer) {
      this.retryTimer = this.deps.setTimeout(() => {
        this.retryTimer = null;
        this.errorsInARow = 0;
        this.openStream();
      }, STREAM_RETRY_MS);
    }
  }
}
