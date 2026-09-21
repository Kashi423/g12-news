"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { categoryPath, PRIMARY_NAV_CATEGORIES } from "@g12/config";

/**
 * Search icon that opens a full-width search overlay. It uses the browser's native <dialog>, so
 * focus is trapped inside, Esc closes it, and focus returns to the icon. The form submits to
 * /search?q=..., which the full search (a later step) will serve.
 */
export function SearchOverlay() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const open = () => {
    dialog.current?.showModal();
    input.current?.focus();
  };
  const close = () => dialog.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Search"
        aria-haspopup="dialog"
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === dialog.current) close(); // click on the backdrop
        }}
        className="fixed inset-x-0 top-0 m-0 h-auto max-h-none w-full max-w-none bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/60"
      >
        <div className="container py-5 lg:py-8">
          <div className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="font-serif text-xl font-black text-brand">
              Search G12 News
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <form action="/search" method="get" role="search" className="mt-3 flex gap-2">
            <label htmlFor={`${titleId}-q`} className="sr-only">
              Search stories
            </label>
            <input
              ref={input}
              id={`${titleId}-q`}
              name="q"
              type="search"
              required
              minLength={2}
              autoComplete="off"
              placeholder="Search stories, people, places..."
              className="h-12 min-w-0 flex-1 border border-line bg-canvas px-4 text-base placeholder:text-muted focus:border-brand focus:outline focus:outline-2 focus:outline-brand"
            />
            <button type="submit" className="h-12 bg-brand px-5 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              Search
            </button>
          </form>

          <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted">Or browse a section</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {PRIMARY_NAV_CATEGORIES.map((category) => (
              <li key={category.id}>
                <Link href={categoryPath(category.slug)} onClick={close} className="inline-block border border-line px-3 py-1.5 text-sm font-medium hover:border-brand hover:text-brand">
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
