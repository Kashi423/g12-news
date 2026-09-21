import { BREAKING_MAX_AGE_MS } from "@g12/config";
import type { BreakingItem } from "./types";

/** Most stories kept in memory (the ticker shows 5, the homepage block 4). */
export const MAX_ITEMS = 8;
/**
 * A story that arrived live is protected from being dropped by a poll response for this long:
 * the poll may have been answered just before the story was committed.
 */
export const LIVE_GRACE_MS = 10_000;

export interface BreakingState {
  /** Newest first. */
  items: BreakingItem[];
  /** Ids that arrived live after page load (they get an entrance animation). */
  liveIds: string[];
  /** Client clock time each live item arrived. */
  arrivedAt: Record<string, number>;
}

export type BreakingAction =
  /** Authoritative list from the server (initial load, stream (re)connect, poll). */
  | { type: "snapshot"; items: BreakingItem[]; now: number }
  /** One story pushed by the stream. */
  | { type: "upsert"; item: BreakingItem; now: number }
  /** A story was un-flagged or unpublished. */
  | { type: "remove"; id: string }
  /** Time passed: drop stories older than the breaking window. */
  | { type: "expire"; now: number };

const time = (item: BreakingItem) => Date.parse(item.publishedAt);
const byNewest = (a: BreakingItem, b: BreakingItem) => time(b) - time(a) || (a.id < b.id ? -1 : 1);
const isFresh = (item: BreakingItem, now: number) => now - time(item) <= BREAKING_MAX_AGE_MS;

function normalize(items: BreakingItem[], now: number): BreakingItem[] {
  const unique = new Map(items.filter((i) => isFresh(i, now)).map((i) => [i.id, i]));
  return [...unique.values()].sort(byNewest).slice(0, MAX_ITEMS);
}

export function initialState(items: BreakingItem[], now: number): BreakingState {
  return { items: normalize(items, now), liveIds: [], arrivedAt: {} };
}

/** Drop bookkeeping for ids that are no longer shown. */
function tidy(state: BreakingState): BreakingState {
  const present = new Set(state.items.map((i) => i.id));
  return {
    items: state.items,
    liveIds: state.liveIds.filter((id) => present.has(id)),
    arrivedAt: Object.fromEntries(Object.entries(state.arrivedAt).filter(([id]) => present.has(id))),
  };
}

export function breakingReducer(state: BreakingState, action: BreakingAction): BreakingState {
  switch (action.type) {
    case "snapshot": {
      const incoming = normalize(action.items, action.now);
      const ids = new Set(incoming.map((i) => i.id));
      // Keep anything that arrived live moments ago even if this (possibly stale) snapshot lacks it.
      const protectedItems = state.items.filter((i) => !ids.has(i.id) && action.now - (state.arrivedAt[i.id] ?? -Infinity) < LIVE_GRACE_MS);
      return tidy({ ...state, items: normalize([...incoming, ...protectedItems], action.now) });
    }
    case "upsert": {
      if (!isFresh(action.item, action.now)) return state;
      const isNew = !state.items.some((i) => i.id === action.item.id);
      const items = normalize([action.item, ...state.items.filter((i) => i.id !== action.item.id)], action.now);
      if (!items.some((i) => i.id === action.item.id)) return { ...state, items }; // too old to make the list
      return tidy({
        items,
        liveIds: isNew ? [...state.liveIds, action.item.id] : state.liveIds,
        arrivedAt: isNew ? { ...state.arrivedAt, [action.item.id]: action.now } : state.arrivedAt,
      });
    }
    case "remove": {
      if (!state.items.some((i) => i.id === action.id)) return state;
      return tidy({ ...state, items: state.items.filter((i) => i.id !== action.id) });
    }
    case "expire": {
      const items = state.items.filter((i) => isFresh(i, action.now));
      return items.length === state.items.length ? state : tidy({ ...state, items });
    }
  }
}
