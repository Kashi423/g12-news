"use client";

import { relativeTime } from "@/lib/breaking/time";
import { useBreaking } from "./breaking-provider";

/** "12 minutes ago", kept current by the site clock in the provider. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const { now } = useBreaking();
  return (
    <time dateTime={iso} className={className} title={new Date(iso).toUTCString()}>
      {relativeTime(iso, now)}
    </time>
  );
}
