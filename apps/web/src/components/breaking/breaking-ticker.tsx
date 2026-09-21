"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type Ref } from "react";
import { articlePath, BREAKING_TICKER_COUNT } from "@g12/config";
import type { BreakingItem } from "@/lib/breaking/types";
import { PulseDot } from "./breaking-badge";
import { useBreaking } from "./breaking-provider";

const SPEED_PX_PER_SECOND = 60;
const TOUCH_RESUME_MS = 3_000;

/**
 * The slim red bar above the header: a pulsing BREAKING badge and an auto-scrolling marquee of the
 * latest breaking headlines. Red only while something is actually breaking (a neutral strip of the
 * same height otherwise), so the red keeps its meaning and the page never shifts.
 * The marquee pauses on hover, keyboard focus and touch; with "reduce motion" it does not move at
 * all and the row can be scrolled by hand instead.
 */
export function BreakingTicker() {
  const { items, mode } = useBreaking();
  const headlines = items.slice(0, BREAKING_TICKER_COUNT);
  const copyRef = useRef<HTMLUListElement>(null);
  const releaseTimer = useRef<number | undefined>(undefined);
  const [duration, setDuration] = useState(40);
  const [touching, setTouching] = useState(false);

  // Constant reading speed whatever the headline length: duration = one copy's width / speed.
  useEffect(() => {
    const copy = copyRef.current;
    if (!copy) return;
    const update = () => setDuration(Math.max(20, Math.round(copy.offsetWidth / SPEED_PX_PER_SECOND)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [headlines.length]);

  useEffect(() => () => window.clearTimeout(releaseTimer.current), []);

  // Nothing breaking: keep the bar's exact height (36px) as a quiet neutral strip, so a story arriving
  // (or the last one expiring) recolours the bar instead of pushing the page down or up.
  if (headlines.length === 0) {
    return (
      <div role="region" aria-label="Breaking news" data-testid="breaking-ticker" data-idle="true" data-transport={mode} className="sticky top-0 z-50 h-9 border-b border-line bg-canvas">
        <div className="container flex h-full items-center gap-2 text-[12px] text-muted">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-line" />
          <span className="truncate">No breaking news right now. This bar updates as stories break.</span>
        </div>
      </div>
    );
  }

  const holdTouch = () => {
    window.clearTimeout(releaseTimer.current);
    setTouching(true);
  };
  // Stay paused briefly after the finger lifts so the headline can be read and tapped.
  const releaseTouch = () => {
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => setTouching(false), TOUCH_RESUME_MS);
  };

  return (
    <div role="region" aria-label="Breaking news" data-testid="breaking-ticker" data-transport={mode} className="sticky top-0 z-50 h-9 bg-breaking text-white shadow-sm">
      <div className="flex h-full items-stretch">
        <div className="flex shrink-0 items-center gap-2 bg-breaking-deep px-3">
          <PulseDot />
          <span className="text-[11px] font-black uppercase tracking-[0.14em]">Breaking</span>
        </div>
        <div
          className="group relative min-w-0 flex-1 overflow-hidden motion-reduce:overflow-x-auto"
          onTouchStart={holdTouch}
          onTouchEnd={releaseTouch}
          onTouchCancel={releaseTouch}
        >
          <div
            data-paused={touching}
            data-testid="breaking-track"
            className="flex h-full w-max animate-marquee items-center group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] data-[paused=true]:[animation-play-state:paused] motion-reduce:animate-none"
            style={{ ["--marquee-duration" as string]: `${duration}s` }}
          >
            <TickerList items={headlines} listRef={copyRef} />
            <TickerList items={headlines} hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One copy of the headlines. The track holds two so the loop is seamless; the second is hidden from assistive tech. */
function TickerList({ items, hidden = false, listRef }: { items: BreakingItem[]; hidden?: boolean; listRef?: Ref<HTMLUListElement> }) {
  return (
    <ul
      ref={listRef}
      aria-hidden={hidden || undefined}
      className={`flex shrink-0 items-center ${hidden ? "motion-reduce:hidden" : ""}`}
      style={{ minWidth: "100vw" }}
    >
      {items.map((item) => (
        <li key={item.id} className="flex items-center whitespace-nowrap">
          <Link
            href={articlePath(item.slug)}
            tabIndex={hidden ? -1 : undefined}
            className="px-4 text-[13px] font-semibold hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {item.title}
          </Link>
          <span aria-hidden="true" className="text-[8px] text-white/60">
            &#9679;
          </span>
        </li>
      ))}
    </ul>
  );
}
