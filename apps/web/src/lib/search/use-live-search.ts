"use client";

import { useCallback, useEffect, useState } from "react";
import type { HomeArticle } from "@/lib/home/types";
import { isSearchable, normalizeQuery, SEARCH_DEBOUNCE_MS } from "./query";

export type LiveSearchStatus = "idle" | "loading" | "results" | "empty" | "error";

export interface LiveSearch {
  status: LiveSearchStatus;
  /** The stories to show: this query's once they arrive, and the previous query's while the next one loads. */
  results: readonly HomeArticle[];
  /** True while `results` still belong to an earlier query. */
  stale: boolean;
  /** The normalized query the status describes. */
  query: string;
  /** Ask again after an error. */
  retry: () => void;
}

type Entry = { ok: true; results: HomeArticle[] } | { ok: false };

/**
 * Live search for the overlay: as the reader types, asks /api/search once they pause for
 * SEARCH_DEBOUNCE_MS. A newer keystroke cancels the pending request (and aborts one already on its way),
 * answers are remembered so backspacing costs nothing, and the previous results stay on screen (marked
 * `stale`) until the new ones arrive, instead of flashing empty.
 */
export function useLiveSearch(rawQuery: string): LiveSearch {
  const query = normalizeQuery(rawQuery);
  const active = isSearchable(query);
  const key = query.toLowerCase();

  const [answers, setAnswers] = useState<Record<string, Entry>>({});
  const [previous, setPrevious] = useState<HomeArticle[]>([]);
  const [attempt, setAttempt] = useState(0);
  const answered = answers[key];

  useEffect(() => {
    if (!active || answered) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { results: HomeArticle[] };
        setAnswers((all) => ({ ...all, [key]: { ok: true, results: data.results } }));
        setPrevious(data.results);
      } catch {
        if (controller.signal.aborted) return;
        setAnswers((all) => ({ ...all, [key]: { ok: false } }));
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `attempt` re-runs the effect for a retry, after the failed answer has been forgotten.
  }, [active, answered, key, query, attempt]);

  const retry = useCallback(() => {
    setAnswers((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
    setAttempt((n) => n + 1);
  }, [key]);

  if (!active) return { status: "idle", results: [], stale: false, query, retry };
  if (!answered) return { status: "loading", results: previous, stale: previous.length > 0, query, retry };
  if (!answered.ok) return { status: "error", results: [], stale: false, query, retry };
  return { status: answered.results.length > 0 ? "results" : "empty", results: answered.results, stale: false, query, retry };
}
