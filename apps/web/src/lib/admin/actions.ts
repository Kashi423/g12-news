"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminConfig, safeEqual, verifyPassword } from "./auth";
import { getDb } from "./data";
import * as db from "./mutations";
import { createLimiter, type Limiter } from "./rate-limit";
import { endSession, requireAdmin, startSession } from "./session";
import { formatAge } from "./time";
import { isCategory, validateEdit, validateSource } from "./validate";

/**
 * Everything the dashboard can do. A server action is a public POST endpoint, so EVERY one starts with
 * `requireAdmin()` (or, for sign-in itself, checks the password). Arguments come from the browser and are
 * treated as untrusted input.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}
export interface LoginState {
  error: string | null;
  /** What was typed in the email box, so the form can show it again. */
  email: string;
}

/** The dashboard, the public pages and the caches behind them all show something different after a change. */
function refresh(): void {
  revalidatePath("/", "layout");
}

const text = (formData: FormData, name: string) => (typeof formData.get(name) === "string" ? (formData.get(name) as string) : "");
const idsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length < 64) : []);

// ---- Sign in / out ---------------------------------------------------------------------------------------

// On globalThis so a dev-server hot reload does not forgive everybody.
const globalLimiters = globalThis as unknown as { __g12Login?: { perClient: Limiter; everyone: Limiter } };
const limiters = (globalLimiters.__g12Login ??= {
  perClient: createLimiter({ maxFailures: 8, windowMs: 15 * 60_000, lockMs: 15 * 60_000 }),
  // Also a ceiling for the whole site: the client address comes from a header a direct caller could invent.
  everyone: createLimiter({ maxFailures: 40, windowMs: 15 * 60_000, lockMs: 10 * 60_000 }),
});

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const config = adminConfig();
  if (!config) return { error: "Admin sign-in is not set up yet.", email: "" };

  const requestHeaders = await headers();
  const client = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "local";
  const email = text(formData, "email").trim().toLowerCase().slice(0, 320);
  const wait = Math.max(limiters.perClient.wait(client), limiters.everyone.wait("all"));
  if (wait > 0) return { error: `Too many failed attempts. Try again in ${formatAge(wait)}.`, email };

  const password = text(formData, "password").slice(0, 500);
  // Both checks always run, so a wrong email takes exactly as long to refuse as a wrong password.
  const passwordOk = verifyPassword(password, config.passwordHash);
  const emailOk = safeEqual(email, config.email);
  if (!passwordOk || !emailOk) {
    limiters.perClient.fail(client);
    limiters.everyone.fail("all");
    return { error: "Wrong email or password.", email };
  }
  limiters.perClient.reset(client);
  await startSession(config);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/admin");
}

// ---- The review switch and the queue ---------------------------------------------------------------------

export async function setRequireReviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.setRequireReview(text(formData, "on") === "true");
  refresh();
}

/** Fire-and-forget: social posting must never make the admin's click wait, or fail the approval if a platform errors. */
function postApprovedToSocial(ids: string[]): void {
  void import("@g12/worker/social")
    .then(({ publishToSocial }) => Promise.all(ids.map((id) => publishToSocial(id))))
    .catch((error: unknown) => console.error(`[admin] social-post after approval failed: ${error instanceof Error ? error.message : error}`));
}

export async function approveAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const wanted = idsOf(ids);
  if (wanted.length === 0) return { ok: false, message: "Nothing was selected." };
  const done = await db.approvePending(wanted);
  refresh();
  if (done === 0) return { ok: false, message: "Nothing to approve: those stories were already dealt with." };
  postApprovedToSocial(wanted);
  return { ok: true, message: `${done === 1 ? "1 story is" : `${done} stories are`} live now.` };
}

export async function editAndApproveAction(id: string, edit: { title?: unknown; excerpt?: unknown; body?: unknown; category?: unknown }): Promise<ActionResult> {
  await requireAdmin();
  const checked = validateEdit(edit ?? {});
  if (!checked.ok) return { ok: false, message: checked.error };
  const done = typeof id === "string" && (await db.editAndApprove(id, checked.value));
  refresh();
  if (done && typeof id === "string") postApprovedToSocial([id]);
  return done ? { ok: true, message: "Saved with your edits and live now." } : { ok: false, message: "That story was already dealt with." };
}

export async function regenerateAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (typeof id !== "string" || !id) return { ok: false, message: "No story given." };
  const { regenerateDraft } = await import("@g12/worker/admin");
  const result = await regenerateDraft(id);
  refresh();
  return result;
}

export async function revalidateAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (typeof id !== "string" || !id) return { ok: false, message: "No story given." };
  const { revalidateDraft } = await import("@g12/worker/admin");
  const result = await revalidateDraft(id);
  refresh();
  return result;
}

export async function rejectAction(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  const wanted = idsOf(ids);
  if (wanted.length === 0) return { ok: false, message: "Nothing was selected." };
  const done = await db.rejectPending(wanted);
  refresh();
  if (done === 0) return { ok: false, message: "Nothing to reject: those stories were already dealt with." };
  return { ok: true, message: `${done === 1 ? "1 story" : `${done} stories`} rejected. ${done === 1 ? "It" : "They"} will not come back from the same source link.` };
}

// ---- Article moderation ----------------------------------------------------------------------------------

export async function unpublishAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.unpublish(text(formData, "id"));
  refresh();
}

export async function republishAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.republish(text(formData, "id"));
  refresh();
}

export async function recategorizeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const category = text(formData, "category");
  if (isCategory(category)) await db.recategorize(text(formData, "id"), category);
  refresh();
}

export async function setBreakingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.setBreaking(text(formData, "id"), text(formData, "breaking") === "true");
  refresh();
}

export async function deleteArticleAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await db.deleteArticle(text(formData, "id"));
  refresh();
}

// ---- Sources ---------------------------------------------------------------------------------------------

export async function fetchNowAction(sourceId: string): Promise<ActionResult> {
  await requireAdmin();
  if (typeof sourceId !== "string" || !sourceId) return { ok: false, message: "No source given." };
  // The same ingestion code the scheduled worker runs (apps/worker), for this one source.
  const { runSourceNow } = await import("@g12/worker/admin");
  const result = await runSourceNow(sourceId);
  refresh();
  return { ok: result.ok, message: result.message };
}

const normalizeUrl = (value: string): string => {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
};

/** Add (no `id` field) or edit (with one) a source. A new or changed feed address is test-fetched right away. */
export async function saveSourceAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const checked = validateSource({ name: formData.get("name"), rssUrl: formData.get("rssUrl"), category: formData.get("category"), isActive: formData.get("isActive"), reliability: formData.get("reliability") });
  if (!checked.ok) return { ok: false, message: checked.error };
  const id = text(formData, "id");
  const prisma = await getDb();

  let addressChanged = true;
  try {
    if (id) {
      const existing = await prisma.source.findUnique({ where: { id }, select: { rssUrl: true } });
      if (!existing) return { ok: false, message: "That source no longer exists." };
      addressChanged = normalizeUrl(existing.rssUrl) !== checked.value.rssUrl;
      await prisma.source.update({ where: { id }, data: checked.value });
    } else {
      await prisma.source.create({ data: checked.value });
    }
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, message: "Another source already uses that feed address." };
    throw error;
  }
  refresh();
  if (!addressChanged) return { ok: true, message: "Saved." };
  const { checkFeed } = await import("@g12/worker/admin");
  const feed = await checkFeed(checked.value.rssUrl);
  return { ok: feed.ok, message: `Saved. Feed check: ${feed.message}${feed.ok ? "." : ". You may want to fix the address or switch the source off."}` };
}
