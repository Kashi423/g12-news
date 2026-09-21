"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { BreakingClient } from "@/lib/breaking/client";
import { breakingReducer, initialState } from "@/lib/breaking/state";
import type { BreakingItem, BreakingMode } from "@/lib/breaking/types";

interface BreakingContextValue {
  /** Breaking stories, newest first. */
  items: BreakingItem[];
  /** Ids that arrived live after page load. */
  liveIds: string[];
  /** The site clock, refreshed every 30 s. Starts as the server's time so server and client markup match. */
  now: number;
  /** How updates are arriving: the live stream, or 30 s polling. */
  mode: BreakingMode;
}

const BreakingContext = createContext<BreakingContextValue | null>(null);

const TICK_MS = 30_000;

/**
 * One live connection for the whole site: the top-bar ticker and the homepage block both read
 * from here, so a story pushed by the server appears in both at once.
 */
export function BreakingProvider({ initial, serverNow, children }: { initial: BreakingItem[]; serverNow: number; children: ReactNode }) {
  const [state, dispatch] = useReducer(breakingReducer, undefined, () => initialState(initial, serverNow));
  const [now, setNow] = useState(serverNow);
  const [mode, setMode] = useState<BreakingMode>("connecting");

  useEffect(() => {
    const client = new BreakingClient({
      createEventSource: typeof EventSource === "undefined" ? undefined : (url) => new EventSource(url),
      fetch: (url, init) => fetch(url, init),
      now: () => Date.now(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (handle) => window.clearInterval(handle as number),
      onAction: dispatch,
      onMode: setMode,
    });
    client.start();

    // Keep relative times fresh and let stories age out of the 6 hour window without a reload.
    const tick = () => {
      const t = Date.now();
      setNow(t);
      dispatch({ type: "expire", now: t });
    };
    tick();
    const clock = window.setInterval(tick, TICK_MS);
    // A phone that slept in a pocket: catch up as soon as the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        tick();
        void client.pollNow();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      client.stop();
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo(() => ({ items: state.items, liveIds: state.liveIds, now, mode }), [state.items, state.liveIds, now, mode]);
  return <BreakingContext.Provider value={value}>{children}</BreakingContext.Provider>;
}

export function useBreaking(): BreakingContextValue {
  const value = useContext(BreakingContext);
  if (!value) throw new Error("useBreaking must be used inside <BreakingProvider>");
  return value;
}
