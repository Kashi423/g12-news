// Sets up admin sign-in:  npm run admin:setup
//
// Asks for the admin email and a password, then writes ADMIN_EMAIL, ADMIN_PASSWORD_HASH (a salted scrypt
// hash: the password itself is never saved) and ADMIN_SESSION_SECRET (random) into the .env file at the
// repo root. It also adds HEALTH_CHECK_TOKEN if there is none (see README: alerting). Run it again to change
// the email or password; that signs the old session out. Restart the website afterwards.
//
// Non-interactive:  npm run admin:setup -- --email=you@example.com --password=...   (bash / cmd)
//                   npm run admin:setup '--' --email=... --password=...              (PowerShell)
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/admin/auth";

const envPath = resolve(import.meta.dirname, "../../../.env");

function flag(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/** Reads a line; with `hidden`, nothing is echoed (typing a password). */
function ask(question: string, hidden = false): Promise<string> {
  if (!hidden || !process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((done) => rl.question(question, (answer) => (rl.close(), done(answer))));
  }
  return new Promise((done) => {
    process.stdout.write(question);
    let typed = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return done(typed);
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        if (char === "\u007f" || char === "\b") typed = typed.slice(0, -1);
        else typed += char;
      }
    };
    process.stdin.on("data", onData);
  });
}

/** Set KEY="value" in the .env text, replacing an existing line; keeps the file's line-ending style. */
function setEnv(text: string, key: string, value: string): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, line);
  return `${text}${text && !text.endsWith("\n") ? eol : ""}${line}${eol}`;
}

function has(text: string, key: string): boolean {
  return new RegExp(`^\\s*${key}\\s*=\\s*["']?\\S`, "m").test(text);
}

const email = (flag("email") ?? (await ask("Admin email: "))).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("That does not look like an email address.");
  process.exit(1);
}
const password = flag("password") ?? (await ask("Password (at least 10 characters, not shown): ", true));
if (password.length < 10) {
  console.error("The password must be at least 10 characters.");
  process.exit(1);
}
if (flag("password") === undefined && (await ask("Type it again: ", true)) !== password) {
  console.error("The two passwords are different. Nothing was changed.");
  process.exit(1);
}

let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
env = setEnv(env, "ADMIN_EMAIL", email);
env = setEnv(env, "ADMIN_PASSWORD_HASH", hashPassword(password));
if (!has(env, "ADMIN_SESSION_SECRET")) env = setEnv(env, "ADMIN_SESSION_SECRET", randomBytes(32).toString("hex"));
const newToken = !has(env, "HEALTH_CHECK_TOKEN");
if (newToken) env = setEnv(env, "HEALTH_CHECK_TOKEN", randomBytes(24).toString("hex"));
writeFileSync(envPath, env);

console.log(`\nSaved to ${envPath}`);
console.log(`  Sign-in email: ${email}`);
if (newToken) console.log("  Added HEALTH_CHECK_TOKEN: an uptime monitor can use it to warn you about a dead pipeline (see README, \"Admin dashboard\").");
console.log("\nRestart the website (npm run start, or npm run dev) for it to take effect, then open /admin.");
