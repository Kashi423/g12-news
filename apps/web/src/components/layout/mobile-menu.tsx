"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { categoryPath, CATEGORIES, SITE, SITE_PAGES } from "@g12/config";
import { useActiveCategory } from "./active-category";

/** The static pages listed in the menu, under the categories. */
const MENU_PAGES = SITE_PAGES.filter((page) => page.label === "About" || page.label === "Contact");

/**
 * Phones and tablets: a hamburger button that slides in a drawer from the left with all nine categories
 * and the About and Contact pages. It is the browser's native <dialog>, so focus is trapped inside while it
 * is open, Esc closes it, and focus goes back to the button. It also closes on a tap on the dim area,
 * on any link, after navigating, and if the window grows to desktop width (where the full nav shows).
 */
export function MobileMenu() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const storyCategory = useActiveCategory();
  const drawerId = useId();
  const titleId = useId();

  const close = () => dialog.current?.close();

  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={drawerId}
        data-testid="menu-button"
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <dialog
        id={drawerId}
        ref={dialog}
        aria-labelledby={titleId}
        data-testid="menu-drawer"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) close(); // a tap on the dim area
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,86vw)] max-w-none overflow-y-auto overscroll-contain bg-canvas p-0 text-ink shadow-2xl backdrop:bg-black/60 open:animate-drawer-in motion-reduce:open:animate-none"
      >
        <div className="flex h-[73px] items-center justify-between border-b border-line px-5">
          <h2 id={titleId} className="font-serif text-xl font-black text-brand">
            {SITE.name}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close menu"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <nav aria-label="All sections" className="py-2">
          <p className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">Sections</p>
          <ul>
            {CATEGORIES.map((category) => {
              const href = categoryPath(category.slug);
              const onPage = pathname === href || pathname.startsWith(`${href}/`);
              const inSection = !onPage && storyCategory === category.slug;
              return (
                <li key={category.id}>
                  <Link
                    href={href}
                    onClick={close}
                    aria-current={onPage ? "page" : inSection ? "true" : undefined}
                    className={`flex h-12 items-center border-l-4 px-5 text-[15px] font-bold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                      onPage || inSection ? "border-crimson bg-surface text-crimson" : "border-transparent text-ink hover:bg-surface hover:text-brand"
                    }`}
                  >
                    {category.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-label="About G12 News" className="border-t border-line py-2">
          <ul>
            {MENU_PAGES.map((page) => {
              const onPage = pathname === page.href;
              return (
                <li key={page.href}>
                  <Link
                    href={page.href}
                    onClick={close}
                    aria-current={onPage ? "page" : undefined}
                    className={`flex h-12 items-center border-l-4 px-5 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
                      onPage ? "border-crimson bg-surface text-crimson" : "border-transparent text-ink hover:bg-surface hover:text-brand"
                    }`}
                  >
                    {page.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </dialog>
    </>
  );
}
