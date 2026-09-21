"use client";

import { useRef, useState, useTransition } from "react";
import { CATEGORIES } from "@g12/config";
import { saveSourceAction, type ActionResult } from "@/lib/admin/actions";

interface Props {
  /** Present when editing an existing source; absent for the "add" form. */
  source?: { id: string; name: string; rssUrl: string; category: string; isActive: boolean };
}

const field = "border border-line bg-white px-2 py-1.5 text-sm";

/** One source: add a new one, or edit / switch off an existing one. A new or changed feed address is test-fetched. */
export function SourceForm({ source }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <form
      ref={form}
      data-testid={source ? "source-edit-form" : "source-add-form"}
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setResult(null);
        // Not `<form action>`: React would clear every box after a refused (invalid) save.
        startTransition(async () => {
          const outcome = await saveSourceAction(null, data);
          setResult(outcome);
          if (outcome.ok && !source) form.current?.reset();
        });
      }}
    >
      {source ? <input type="hidden" name="id" value={source.id} /> : null}
      <input name="name" defaultValue={source?.name} placeholder="Name, e.g. Dawn — Business" aria-label="Name" required maxLength={80} className={`${field} w-56`} />
      <input name="rssUrl" type="url" defaultValue={source?.rssUrl} placeholder="https://example.com/rss" aria-label="Feed address" required className={`${field} w-72 max-w-full`} />
      <select name="category" defaultValue={source?.category ?? "PAKISTAN"} aria-label="Default category" className={field}>
        {CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 py-1.5 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={source?.isActive ?? true} className="h-4 w-4" />
        Active
      </label>
      <button type="submit" disabled={busy} className="border border-brand bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-60">
        {busy ? "Saving…" : source ? "Save" : "Add source"}
      </button>
      {result ? (
        <span role="status" className={`basis-full text-xs ${result.ok ? "text-green-700" : "font-semibold text-crimson"}`}>
          {result.message}
        </span>
      ) : null}
    </form>
  );
}
