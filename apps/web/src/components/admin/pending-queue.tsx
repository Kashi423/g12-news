"use client";

import { useState, useTransition } from "react";
import { CATEGORY_BY_ID, CATEGORIES, type CategoryId } from "@g12/config";
import { approveAction, editAndApproveAction, regenerateAction, rejectAction, revalidateAction, type ActionResult } from "@/lib/admin/actions";
import type { PendingItem } from "@/lib/admin/data";
import { formatAge } from "@/lib/admin/time";

const button = "border px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${button} border-brand bg-brand text-white hover:bg-brand-800`;
const plain = `${button} border-line bg-white text-ink hover:bg-surface`;
const danger = `${button} border-crimson bg-white text-crimson hover:bg-crimson-50`;

/** The review queue: every story waiting for a decision, with its full text, and the actions on it. */
export function PendingQueue({ items, total, emptyText }: { items: PendingItem[]; total: number; emptyText: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  // Only stories still in the list count (an approved one disappears after the page refreshes).
  const chosen = items.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allChosen = items.length > 0 && chosen.length === items.length;

  function run(task: () => Promise<ActionResult>, after?: (result: ActionResult) => void) {
    startTransition(async () => {
      const result = await task();
      setNotice(result);
      if (result.ok) after?.(result);
    });
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // The empty state lives here, not in the page: when the last story is approved this component must stay
  // mounted, or the "N stories are live now" confirmation would vanish with it.
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {notice ? (
          <p role="status" className={`border px-3 py-2 text-sm font-semibold ${notice.ok ? "border-green-600 bg-green-50 text-green-800" : "border-crimson bg-crimson-50 text-crimson"}`}>
            {notice.message}
          </p>
        ) : null}
        <p className="border border-line bg-surface p-4 text-sm text-muted" data-testid="pending-empty">
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border border-line bg-surface p-2.5">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={allChosen}
            onChange={(event) => setSelected(event.target.checked ? new Set(items.map((item) => item.id)) : new Set())}
          />
          Select all ({items.length})
        </label>
        <button type="button" disabled={busy || chosen.length === 0} className={primary} onClick={() => run(() => approveAction(chosen), () => setSelected(new Set()))}>
          Approve selected ({chosen.length})
        </button>
        <button
          type="button"
          disabled={busy || items.length === 0}
          className={plain}
          onClick={() => {
            if (window.confirm(`Approve all ${items.length} stories shown and put them on the site now?`)) run(() => approveAction(items.map((item) => item.id)), () => setSelected(new Set()));
          }}
        >
          Approve all ({items.length})
        </button>
        <button
          type="button"
          disabled={busy || chosen.length === 0}
          className={danger}
          onClick={() => {
            if (window.confirm(`Reject ${chosen.length} selected ${chosen.length === 1 ? "story" : "stories"}? They stay off the site and will not be fetched again.`)) run(() => rejectAction(chosen), () => setSelected(new Set()));
          }}
        >
          Reject selected ({chosen.length})
        </button>
        {busy ? <span className="text-xs text-muted">Working…</span> : null}
        {total > items.length ? <span className="text-xs text-muted">Showing the newest {items.length} of {total}; the rest appear as you clear these.</span> : null}
      </div>

      {notice ? (
        <p role="status" className={`border px-3 py-2 text-sm font-semibold ${notice.ok ? "border-green-600 bg-green-50 text-green-800" : "border-crimson bg-crimson-50 text-crimson"}`}>
          {notice.message}
        </p>
      ) : null}

      {items.map((item) => (
        <article key={item.id} data-testid="pending-item" data-overdue={item.overdue} className={`border p-3 ${item.overdue ? "border-amber-500 bg-amber-50" : "border-line bg-white"}`}>
          <div className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" aria-label={`Select: ${item.title}`} checked={selected.has(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} />
            <div className="min-w-0 flex-1">
              {editing === item.id ? (
                <EditForm
                  item={item}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(edit) => run(() => editAndApproveAction(item.id, edit), () => setEditing(null))}
                />
              ) : (
                <>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="bg-brand-50 px-1.5 py-0.5 font-bold text-brand">{CATEGORY_BY_ID[item.category].name}</span>
                    <span>Urgency {item.urgencyScore}/10</span>
                    {item.isBreaking ? <span className="font-bold text-crimson">Flagged breaking</span> : null}
                    <span>
                      {item.sourceName} ·{" "}
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-brand underline">
                        read the original
                      </a>
                    </span>
                    <span className={item.overdue ? "font-bold text-amber-800" : ""}>Waiting {formatAge(item.waitingMs)}{item.overdue ? " (overdue)" : ""}</span>
                  </p>
                  <QualityBadges item={item} />
                  <h3 className="mt-1 font-serif text-lg font-bold leading-snug">{item.title}</h3>
                  <p className="mt-1 text-sm italic text-muted">{item.excerpt}</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{item.body}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} className={primary} onClick={() => run(() => approveAction([item.id]))}>
                      Approve
                    </button>
                    <button type="button" disabled={busy} className={plain} onClick={() => setEditing(item.id)}>
                      Edit &amp; approve
                    </button>
                    <button type="button" disabled={busy} className={plain} onClick={() => run(() => regenerateAction(item.id))}>
                      Regenerate
                    </button>
                    <button type="button" disabled={busy} className={plain} onClick={() => run(() => revalidateAction(item.id))}>
                      Revalidate
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className={danger}
                      onClick={() => {
                        if (window.confirm("Reject this story? It stays off the site and will not be fetched again.")) run(() => rejectAction([item.id]));
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * The pipeline's internal editorial signal — quality score, source agreement, claim validation —
 * surfaced for the admin only (requirement #8: never shown to readers). Absent for a story saved
 * before this existed.
 */
function QualityBadges({ item }: { item: PendingItem }) {
  if (item.qualityScore === null && !item.verification) return null;
  const v = item.verification;
  const failingClaims = v?.claims.filter((c) => c.status === "conflicting" || c.status === "unsupported").length ?? 0;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {item.qualityScore !== null && (
        <span className={`px-1.5 py-0.5 font-bold ${item.qualityScore < 40 ? "bg-crimson-50 text-crimson" : item.qualityScore < 70 ? "bg-amber-100 text-amber-900" : "bg-green-50 text-green-800"}`}>
          Quality {item.qualityScore}/100
        </span>
      )}
      {v && (
        <span
          className={`px-1.5 py-0.5 font-bold ${v.agreement === "conflicting" ? "bg-crimson-50 text-crimson" : v.agreement === "confirmed" ? "bg-green-50 text-green-800" : "bg-surface text-muted"}`}
        >
          {v.agreement === "confirmed" ? `Confirmed by ${v.sourceCount} sources` : v.agreement === "conflicting" ? "Sources conflict" : "Single source"}
        </span>
      )}
      {failingClaims > 0 && <span className="bg-crimson-50 px-1.5 py-0.5 font-bold text-crimson">{failingClaims} unsupported claim{failingClaims === 1 ? "" : "s"}</span>}
      {v && v.conflicts.length > 0 && <span className="text-muted">({v.conflicts[0]})</span>}
    </p>
  );
}

function EditForm({ item, busy, onSave, onCancel }: { item: PendingItem; busy: boolean; onSave: (edit: { title: string; excerpt: string; body: string; category: CategoryId }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [excerpt, setExcerpt] = useState(item.excerpt);
  const [body, setBody] = useState(item.body);
  const [category, setCategory] = useState<CategoryId>(item.category);
  const field = "w-full border border-line bg-white px-2 py-1.5 text-sm";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ title, excerpt, body, category });
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-bold">
        Headline
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required className={`${field} font-serif text-base font-bold`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        Summary line (shown on cards; leave empty to write one from the story)
        <textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} rows={2} maxLength={300} className={`${field} font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold">
        Story text
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} required className={`${field} font-normal leading-relaxed`} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold sm:max-w-xs">
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value as CategoryId)} className={field}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primary}>
          Publish with these edits
        </button>
        <button type="button" disabled={busy} className={plain} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
