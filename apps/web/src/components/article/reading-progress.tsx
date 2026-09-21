"use client";

import { useEffect, useRef } from "react";
import { readingProgress } from "@/lib/article/progress";

/**
 * A thin bar that fills as the reader scrolls through the story (the element with id `targetId`).
 * It sits just under the sticky breaking-news bar (h-9), so it is always on white. The fill is set
 * straight on the element, once per animation frame, so scrolling never re-renders React. It is
 * decoration only, hidden from screen readers, and without JavaScript it simply stays empty.
 */
export function ReadingProgress({ targetId }: { targetId: string }) {
  const fill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const bar = fill.current;
    if (!target || !bar) return;

    let frame = 0;
    const paint = () => {
      frame = 0;
      const { top, height } = target.getBoundingClientRect();
      bar.style.transform = `scaleX(${readingProgress(top, height, window.innerHeight)})`;
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div aria-hidden="true" data-testid="reading-progress" className="pointer-events-none fixed inset-x-0 top-9 z-40 h-[3px]">
      <div ref={fill} className="h-full origin-left bg-brand" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}
