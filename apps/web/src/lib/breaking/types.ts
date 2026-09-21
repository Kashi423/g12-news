import type { CategoryId } from "@g12/config";

/** A breaking story as the ticker, the homepage block and the live stream see it. */
export interface BreakingItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: CategoryId;
  /** Outlet the story was summarized from, e.g. "Dawn". */
  sourceName: string;
  /** ISO 8601. */
  publishedAt: string;
  urgencyScore: number;
}

/** Messages the server pushes down the /api/breaking-stream event stream. */
export type StreamMessage =
  | { event: "snapshot"; data: { items: BreakingItem[] } }
  | { event: "breaking"; data: { item: BreakingItem } }
  | { event: "removed"; data: { id: string } }
  /** `live: false` means the server cannot currently receive database notifications, so clients should poll. */
  | { event: "status"; data: { live: boolean } };

/** How the browser is currently getting updates. */
export type BreakingMode = "connecting" | "stream" | "polling";
