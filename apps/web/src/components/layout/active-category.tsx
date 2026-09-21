"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface ActiveCategoryValue {
  /** Slug of the category the current page belongs to but is not the page of (an article's category), or null. */
  active: string | null;
  set: (slug: string | null) => void;
}

const ActiveCategoryContext = createContext<ActiveCategoryValue>({ active: null, set: () => {} });

/**
 * Lets a page tell the navigation which category it belongs to. A category page is recognised from its
 * address, but a story's address (/article/...) says nothing about its category, so the article page
 * renders <ActiveCategory slug="sports" /> and the nav highlights Sports while the story is open.
 */
export function ActiveCategoryProvider({ children }: { children: React.ReactNode }) {
  const [active, set] = useState<string | null>(null);
  const value = useMemo(() => ({ active, set }), [active]);
  return <ActiveCategoryContext.Provider value={value}>{children}</ActiveCategoryContext.Provider>;
}

export function useActiveCategory(): string | null {
  return useContext(ActiveCategoryContext).active;
}

/** Renders nothing. While mounted, the navigation treats `slug` as the current section. */
export function ActiveCategory({ slug }: { slug: string }) {
  const { set } = useContext(ActiveCategoryContext);
  useEffect(() => {
    set(slug);
    return () => set(null);
  }, [slug, set]);
  return null;
}
