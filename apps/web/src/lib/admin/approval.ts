import { isCurrentlyBreaking } from "@g12/config";

export interface PendingRow {
  id: string;
  /** When the outlet published it (the pipeline stores this as the story's time). */
  publishedAt: Date;
  isBreaking: boolean;
}

export interface ApprovalUpdate {
  id: string;
  publishedAt: Date;
  isBreaking: boolean;
}

/**
 * What to write when the owner approves stories that were waiting for review.
 *
 *  - `publishedAt` becomes "now" (that is when the story goes live). Stories approved together keep their
 *    original order, one millisecond apart, so a bulk approval does not shuffle them on the site.
 *  - The breaking flag survives only if the story was still fresh (inside the 6-hour breaking window) at
 *    the moment of approval. Resetting `publishedAt` would otherwise turn a story that sat in the queue
 *    for a day into "breaking news" again for six more hours.
 */
export function planApproval(rows: PendingRow[], now: Date): ApprovalUpdate[] {
  const ordered = [...rows].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.id.localeCompare(b.id));
  return ordered.map((row, index) => ({
    id: row.id,
    publishedAt: new Date(now.getTime() - (ordered.length - 1 - index)),
    isBreaking: isCurrentlyBreaking({ isBreaking: row.isBreaking, publishedAt: row.publishedAt }, now),
  }));
}
