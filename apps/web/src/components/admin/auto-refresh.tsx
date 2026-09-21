"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-reads the dashboard every so often while the tab is open and visible, so a warning banner or a new
 * queued story appears without pressing reload. Only the server-rendered data is refreshed: whatever is
 * typed into a form on the page stays where it is.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
