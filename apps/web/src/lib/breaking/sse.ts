/** One Server-Sent Events frame. JSON.stringify never emits a raw newline, so one `data:` line is enough. */
export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Tell the browser how long to wait before reconnecting after a dropped connection. */
export const SSE_RETRY_FRAME = "retry: 5000\n\n";

/** A comment line: keeps proxies from closing an idle connection. Browsers ignore it. */
export const SSE_KEEPALIVE_FRAME = ": keepalive\n\n";

/** How often the server sends a `ping` event so browsers can tell a silent stream from a live one. */
export const HEARTBEAT_MS = 20_000;
