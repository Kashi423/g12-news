import { getBreakingBroker } from "@/lib/breaking/broker-instance";
import { getBreakingItems } from "@/lib/breaking/queries";
import { formatSse, HEARTBEAT_MS, SSE_KEEPALIVE_FRAME, SSE_RETRY_FRAME } from "@/lib/breaking/sse";
import type { StreamMessage } from "@/lib/breaking/types";

// Server-Sent Events: pushes breaking stories to the browser the moment the database announces them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const broker = getBreakingBroker();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
      let unsubscribe = () => {};

      // Registered before anything is awaited, so a client that disconnects mid-setup leaks nothing.
      cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) return cleanup();

      const write = (frame: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          cleanup(); // the client went away
        }
      };
      const send = (message: StreamMessage) => write(formatSse(message.event, message.data));

      // Subscribe first but hold pushes back until the snapshot is out, so a story that arrives
      // while we are loading it is neither lost nor overwritten by an older snapshot.
      let ready = false;
      const held: StreamMessage[] = [];
      unsubscribe = broker.subscribe((message) => (ready ? send(message) : held.push(message)));

      write(SSE_RETRY_FRAME);
      send({ event: "status", data: { live: broker.isLive() } });
      const items = await getBreakingItems();
      if (closed) return;
      if (items) send({ event: "snapshot", data: { items } });
      ready = true;
      for (const message of held.splice(0)) send(message);

      heartbeat = setInterval(() => {
        write(formatSse("ping", { t: Date.now() }));
        write(SSE_KEEPALIVE_FRAME);
      }, HEARTBEAT_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // stop nginx-style proxies from buffering the stream
    },
  });
}
