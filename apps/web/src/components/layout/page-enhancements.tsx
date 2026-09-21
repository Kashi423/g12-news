"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { refreshRelativeTimes, showFailedImageFallbacks, showImageFallback } from "@/lib/dom-enhancements";

/**
 * The one client script that serves every story card on every page, and renders nothing itself:
 *
 * - **Failed pictures.** Image errors do not bubble, but they can be caught in the capture phase of the
 *   document, so a single listener swaps any story picture that fails to load for the logo card. After each
 *   page appears it also checks pictures that failed before the script was running.
 * - **Live times.** Rewrites every "x minutes ago" once per page and every 30 seconds after that (and when
 *   the tab becomes visible again).
 *
 * This replaces a hydrated client component per picture and per time on each card, which was the largest
 * part of the JavaScript work on the homepage.
 */
export function PageEnhancements() {
  const pathname = usePathname();

  useEffect(() => {
    const onError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) showImageFallback(event.target);
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) refreshRelativeTimes();
    };
    const timer = window.setInterval(() => refreshRelativeTimes(), 30_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // A new page has new cards: check them once they are on screen.
  useEffect(() => {
    showFailedImageFallbacks();
    refreshRelativeTimes();
  }, [pathname]);

  return null;
}
