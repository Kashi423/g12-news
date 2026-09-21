import { SETTING_REQUIRE_REVIEW, type CategoryId } from "@g12/config";
import { planApproval } from "./approval";
import { getDb } from "./data";
import type { StoryEdit } from "./validate";

/**
 * The admin's database writes (server-only). No sign-in check in here: that is the job of the server
 * actions in actions.ts, the only callers. Every write is guarded by the status it expects (`where status =`),
 * so a double click, or a second browser tab acting on a story that was already dealt with, changes nothing.
 */

/** Never touch more than this many stories in one bulk action. */
export const BULK_LIMIT = 500;

export async function setRequireReview(on: boolean): Promise<void> {
  const db = await getDb();
  const value = on ? "true" : "false";
  await db.setting.upsert({ where: { key: SETTING_REQUIRE_REVIEW }, create: { key: SETTING_REQUIRE_REVIEW, value }, update: { value } });
}

/** Queued -> live. Returns how many stories were actually approved. */
export async function approvePending(ids: string[], now: Date = new Date()): Promise<number> {
  const db = await getDb();
  const rows = await db.article.findMany({ where: { id: { in: ids.slice(0, BULK_LIMIT) }, status: "PENDING_REVIEW" }, select: { id: true, publishedAt: true, isBreaking: true } });
  const plan = planApproval(rows, now);
  const results = await db.$transaction(
    plan.map((u) => db.article.updateMany({ where: { id: u.id, status: "PENDING_REVIEW" }, data: { status: "PUBLISHED", publishedAt: u.publishedAt, isBreaking: u.isBreaking } })),
  );
  return results.reduce((n, r) => n + r.count, 0);
}

/** Edit & Approve: the owner's wording replaces the AI's, and the story goes live. */
export async function editAndApprove(id: string, edit: StoryEdit, now: Date = new Date()): Promise<boolean> {
  const db = await getDb();
  const row = await db.article.findFirst({ where: { id, status: "PENDING_REVIEW" }, select: { id: true, publishedAt: true, isBreaking: true } });
  if (!row) return false;
  const [update] = planApproval([row], now);
  const result = await db.article.updateMany({
    where: { id, status: "PENDING_REVIEW" },
    data: { title: edit.title, excerpt: edit.excerpt, body: edit.body, category: edit.category, status: "PUBLISHED", publishedAt: update!.publishedAt, isBreaking: update!.isBreaking },
  });
  return result.count === 1;
}

/**
 * Queued -> rejected. The row stays (only its status changes), so the pipeline finds the source URL
 * already in the table and never sends the same story again.
 */
export async function rejectPending(ids: string[]): Promise<number> {
  const db = await getDb();
  const result = await db.article.updateMany({ where: { id: { in: ids.slice(0, BULK_LIMIT) }, status: "PENDING_REVIEW" }, data: { status: "REJECTED", isBreaking: false } });
  return result.count;
}

export async function unpublish(id: string): Promise<boolean> {
  const db = await getDb();
  return (await db.article.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "DRAFT" } })).count === 1;
}

export async function republish(id: string): Promise<boolean> {
  const db = await getDb();
  return (await db.article.updateMany({ where: { id, status: "DRAFT" }, data: { status: "PUBLISHED" } })).count === 1;
}

/** Move a story to another category. A change also stamps `correctedAt`, which the story page shows as "Updated". */
export async function recategorize(id: string, category: CategoryId, now: Date = new Date()): Promise<boolean> {
  const db = await getDb();
  return (await db.article.updateMany({ where: { id, status: { in: ["PUBLISHED", "DRAFT"] }, category: { not: category } }, data: { category, correctedAt: now } })).count === 1;
}

export async function setBreaking(id: string, breaking: boolean): Promise<boolean> {
  const db = await getDb();
  return (await db.article.updateMany({ where: { id, status: "PUBLISHED", isBreaking: !breaking }, data: { isBreaking: breaking } })).count === 1;
}

/**
 * "Delete": the story is gone from the site and from the dashboard, and its text is wiped. The row itself is
 * kept as an empty REJECTED stub on purpose: deleting it outright would leave the pipeline free to fetch the
 * same story from the same feed again on its next run, and the embarrassing story would come straight back.
 */
export async function deleteArticle(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.article.updateMany({
    where: { id, status: { in: ["PUBLISHED", "DRAFT"] } },
    data: { status: "REJECTED", isBreaking: false, excerpt: "Deleted by the admin", body: "", imageUrl: null, imageCredit: null, tags: [] },
  });
  return result.count === 1;
}
