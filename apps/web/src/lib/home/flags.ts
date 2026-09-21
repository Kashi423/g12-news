import { isCurrentlyBreaking } from "@g12/config";
import type { HomeArticle } from "./types";

/** Whether a story is breaking right now (flagged and within the 6 hour window). */
export function isBreakingNow(article: Pick<HomeArticle, "isBreaking" | "publishedAt">): boolean {
  return isCurrentlyBreaking(article, Date.now());
}
