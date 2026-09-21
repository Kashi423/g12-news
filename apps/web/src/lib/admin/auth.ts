import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Single-user admin sign-in, with nothing stored in the database.
 *
 * The owner's email and a SALTED HASH of the password live in the environment (ADMIN_EMAIL,
 * ADMIN_PASSWORD_HASH, made by `npm run admin:setup`); the browser gets a signed, expiring cookie
 * (HMAC with ADMIN_SESSION_SECRET). Changing the secret, the email or the password hash signs the
 * owner out everywhere. Pure functions only: the cookie handling is in session.ts.
 */

// scrypt parameters. N=16384, r=8 uses 16 MB and about 50 ms: slow enough to make guessing expensive,
// and inside Node's default memory limit (which N=32768 would exceed).
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

/** Cookie lifetime. */
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600;

const b64 = (buffer: Buffer) => buffer.toString("base64url");

/**
 * "scrypt:N:r:p:salt:hash". Colons, not the usual "$": Next.js expands "$NAME" in .env values, which
 * would silently mangle a hash written with dollar signs.
 */
export function hashPassword(password: string, salt: Buffer = randomBytes(16)): string {
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, b64(salt), b64(hash)].join(":");
}

/** Constant-time password check. Malformed hashes are simply "wrong", never an error. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Constant-time string comparison (different lengths are simply unequal). */
export function safeEqual(a: string, b: string): boolean {
  // Hashing first gives both sides the same length, which timingSafeEqual requires.
  const left = createHmac("sha256", "g12").update(a).digest();
  const right = createHmac("sha256", "g12").update(b).digest();
  return timingSafeEqual(left, right);
}

export interface AdminConfig {
  email: string;
  passwordHash: string;
  secret: string;
}

/** What is still missing from the environment for sign-in to work (empty = ready). */
export function adminConfigProblems(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  if (!env.ADMIN_EMAIL?.trim()) problems.push("ADMIN_EMAIL");
  if (!env.ADMIN_PASSWORD_HASH?.trim()) problems.push("ADMIN_PASSWORD_HASH");
  if ((env.ADMIN_SESSION_SECRET?.trim().length ?? 0) < 32) problems.push("ADMIN_SESSION_SECRET (at least 32 characters)");
  return problems;
}

export function adminConfig(env: Record<string, string | undefined> = process.env): AdminConfig | null {
  if (adminConfigProblems(env).length > 0) return null;
  return { email: env.ADMIN_EMAIL!.trim().toLowerCase(), passwordHash: env.ADMIN_PASSWORD_HASH!.trim(), secret: env.ADMIN_SESSION_SECRET!.trim() };
}

function signature(config: AdminConfig, expires: number): string {
  // The password hash is part of what is signed, so changing the password ends every session.
  return createHmac("sha256", config.secret).update(`g12-admin|${config.email}|${config.passwordHash}|${expires}`).digest("base64url");
}

/** A cookie value that proves "the owner signed in" until `now + ttl`. */
export function createSession(config: AdminConfig, now: Date = new Date(), ttlSeconds = SESSION_MAX_AGE_SECONDS): string {
  const expires = Math.floor(now.getTime() / 1000) + ttlSeconds;
  return `${expires}.${signature(config, expires)}`;
}

export function verifySession(token: string | undefined | null, config: AdminConfig, now: Date = new Date()): boolean {
  if (!token) return false;
  const [expiresText, sig, extra] = token.split(".");
  if (!expiresText || !sig || extra !== undefined || !/^\d{1,12}$/.test(expiresText)) return false;
  const expires = Number(expiresText);
  if (expires * 1000 <= now.getTime()) return false;
  return safeEqual(sig, signature(config, expires));
}
