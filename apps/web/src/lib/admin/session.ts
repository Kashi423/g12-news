import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/site-url";
import { adminConfig, createSession, SESSION_MAX_AGE_SECONDS, verifySession, type AdminConfig } from "./auth";

/** Server-only cookie handling for the admin sign-in (the crypto is in auth.ts). */

export const SESSION_COOKIE = "g12_admin";
/** The cookie is only ever sent to /admin (the page and the server actions posted to it). */
const COOKIE_PATH = "/admin";

/** Is this request from the signed-in owner? Checked once per request. */
export const isAdmin = cache(async (): Promise<boolean> => {
  const config = adminConfig();
  if (!config) return false;
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value, config);
});

/**
 * Every server action and admin page calls this first. A layout is NOT enough: Next.js does not re-run a
 * layout when the reader navigates between pages, and a server action is a public POST endpoint that can
 * be called without ever loading the page.
 */
export async function requireAdmin(): Promise<AdminConfig> {
  const config = adminConfig();
  if (!config || !(await isAdmin())) redirect("/admin");
  return config;
}

export async function startSession(config: AdminConfig): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSession(config), {
    httpOnly: true,
    sameSite: "lax",
    // Only when the site is served over https: a Secure cookie would never be sent back over plain http (local use).
    secure: siteUrl().protocol === "https:",
    path: COOKIE_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: COOKIE_PATH, maxAge: 0 });
}
