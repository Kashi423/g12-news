"use client";

import { useState, useTransition } from "react";
import { fetchNowAction, type ActionResult } from "@/lib/admin/actions";

/** Runs one ingestion pass for one source, right now, and says how it went. Can take up to a minute or so (AI calls). */
export function FetchNowButton({ sourceId, disabled }: { sourceId: string; disabled?: boolean }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy || disabled}
        title={disabled ? "Switch this source on under Sources first" : "Fetch this feed and run the AI on new stories now"}
        className="border border-brand bg-white px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            setResult(await fetchNowAction(sourceId));
          });
        }}
      >
        {busy ? "Fetching…" : "Fetch now"}
      </button>
      {busy ? <span className="text-xs text-muted">Reading the feed and asking the AI. This can take up to a minute.</span> : null}
      {result ? (
        <span role="status" className={`max-w-xs text-xs ${result.ok ? "text-green-700" : "font-semibold text-crimson"}`}>
          {result.message}
        </span>
      ) : null}
    </div>
  );
}
