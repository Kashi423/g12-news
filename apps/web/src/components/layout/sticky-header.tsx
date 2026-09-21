"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { nextCompact } from "@/lib/layout/compact";

/** Height of the breaking-news bar above the header (h-9), which is sticky too. */
const TICKER_HEIGHT = 36;
/** The header's full-size height at each breakpoint: keep in step with the h-[73px] / lg:h-[93px] classes below. */
const FULL_HEIGHT = { mobile: 73, desktop: 93 } as const;

/**
 * The header, stuck under the breaking-news bar while the page scrolls, and compact (a smaller logo and
 * less padding) once the reader has scrolled past the page's hero.
 *
 * Compacting must not move the page. So the sticky element is a fixed-height, see-through wrapper that
 * always takes the header's full-size room in the page; the visible bar inside it is what shrinks, over
 * the empty part of the wrapper. Nothing below it changes position (the wrapper ignores the mouse, so the
 * see-through part never blocks a click). Children stay server-rendered and react to the bar's
 * `data-compact` attribute through Tailwind's `group-data-[compact=true]:` variants.
 *
 * The "hero" is whatever the page marks with `data-page-hero` (the homepage's top story, an article's
 * picture); pages without one compact after a short scroll instead.
 *
 * It measures the page when the reader scrolls or resizes the window. It never asks the browser for the
 * header's own size (the heights above are fixed), and it makes no measurement while a page is loading: asking
 * for a position then forces a layout of a page that is still changing, which is slow and delays the first
 * paint. A page opened fresh starts at the top and needs none. A page that the browser scrolls for the reader
 * (a reload or the Back button restores the old position, a #link scrolls to its target) does: that scroll
 * happens before this code is listening, so it is measured once, after the page has loaded and is idle.
 */
export function StickyHeader({ children }: { children: React.ReactNode }) {
  const [compact, setCompact] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = document.querySelector("[data-page-hero]");
      const full = window.matchMedia("(min-width: 1024px)").matches ? FULL_HEIGHT.desktop : FULL_HEIGHT.mobile;
      setCompact((current) => nextCompact(current, { scrollY: window.scrollY, heroBottom: hero ? hero.getBoundingClientRect().bottom : null, stackBottom: TICKER_HEIGHT + full }));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    // A page the browser has already scrolled needs one measurement, but not while it is still loading.
    let idle = 0;
    let idleTimer = 0;
    const measureOnce = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(schedule, { timeout: 1500 });
      else idleTimer = window.setTimeout(schedule, 250);
    };
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const scrolledByBrowser = navigation?.type === "reload" || navigation?.type === "back_forward" || window.location.hash !== "";
    const afterLoad = scrolledByBrowser && document.readyState !== "complete";
    if (scrolledByBrowser) {
      if (afterLoad) window.addEventListener("load", measureOnce, { once: true });
      else measureOnce();
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("load", measureOnce);
      if (idle !== 0) window.cancelIdleCallback(idle);
      window.clearTimeout(idleTimer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
    // A new page has a new hero (or none), so the rule is re-read after every navigation (Next.js scrolls to
    // the top of a new page, which is a scroll event).
  }, [pathname]);

  return (
    <div data-testid="header-slot" className="pointer-events-none sticky top-9 z-40 h-[73px] lg:h-[93px]">
      <header
        data-testid="site-header"
        data-compact={compact}
        className="group pointer-events-auto h-[73px] border-b border-line bg-canvas transition-[height,box-shadow] duration-200 ease-out data-[compact=true]:h-[53px] data-[compact=true]:shadow-md motion-reduce:transition-none lg:h-[93px] lg:data-[compact=true]:h-[61px]"
      >
        {children}
      </header>
    </div>
  );
}
