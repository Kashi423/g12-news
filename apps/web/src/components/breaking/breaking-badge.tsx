import type { ReactNode } from "react";

/**
 * The "BREAKING" badge. Use it wherever a breaking story shows up in a list (homepage block, category
 * pages, search): pair it with `breakingCardClass()` for the red accent border.
 */
export function BreakingBadge({ pulse = false, className = "", children = "Breaking" }: { pulse?: boolean; className?: string; children?: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm bg-breaking px-1.5 py-0.5 text-[10px] font-black uppercase leading-none tracking-[0.12em] text-white ${className}`}
    >
      {pulse && <PulseDot />}
      {children}
    </span>
  );
}

/** A dot with an expanding ring; the ring is switched off for people who prefer reduced motion. */
export function PulseDot({ className = "bg-white", still = false }: { className?: string; still?: boolean }) {
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      {!still && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none ${className}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${className}`} />
    </span>
  );
}

/** Red accent border for a story card or list row that is currently breaking (empty string otherwise). */
export function breakingCardClass(isBreaking: boolean): string {
  return isBreaking ? "border-l-4 border-l-breaking pl-3" : "";
}
