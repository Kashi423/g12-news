// Insert the starter RSS sources (packages/config/src/sources.ts) into the Source table.
//   npm run seed                verify each feed first, then insert
//   npm run seed -- --no-verify skip the live check
//
// Safe to re-run: existing sources only get their name/category refreshed; isActive is never changed,
// so a source you disabled stays disabled. New sources whose feed is unreachable, invalid or
// stale are inserted with isActive = false and the reason in lastError.
import "../env";
import { SOURCES } from "@g12/config";
import { describeError, fetchFeed } from "../ingest/feed";
import { mapPool } from "../ingest/pool";
import { disconnectDatabase, missingEnv } from "../runtime";
import { loadSettings } from "../settings";

const STALE_AFTER_HOURS = 24 * 7;

interface Check {
  ok: boolean;
  note: string;
}

async function verify(url: string): Promise<Check> {
  try {
    const items = await fetchFeed(url, loadSettings());
    if (items.length === 0) return { ok: false, note: "feed is empty" };
    const times = items.map((i) => i.publishedAt?.getTime()).filter((t): t is number => typeof t === "number");
    if (times.length === 0) return { ok: true, note: `${items.length} items (no dates)` };
    const ageHours = Math.round((Date.now() - Math.max(...times)) / 3_600_000);
    if (ageHours > STALE_AFTER_HOURS) return { ok: false, note: `stale: newest item is ${Math.round(ageHours / 24)} days old` };
    return { ok: true, note: `${items.length} items, newest ${ageHours}h ago` };
  } catch (error) {
    return { ok: false, note: describeError(error) };
  }
}

const skipVerify = process.argv.includes("--no-verify");
const missing = missingEnv({ needsAi: false });
if (missing.length) {
  console.error(`Missing or invalid environment setting(s): ${missing.join("; ")}\nCopy .env.example to .env in the repo root and fill them in.`);
  process.exit(1);
}

let exitCode = 0;
try {
  const { prisma } = await import("@g12/db");
  console.log(`Seeding ${SOURCES.length} sources${skipVerify ? " (feed verification skipped)" : " (verifying each feed first)"}...\n`);

  const checks = skipVerify ? SOURCES.map((): Check => ({ ok: true, note: "not verified" })) : await mapPool(SOURCES, 5, (s) => verify(s.rssUrl));

  let created = 0;
  let updated = 0;
  let inactive = 0;
  for (const [i, source] of SOURCES.entries()) {
    const check = checks[i]!;
    const existing = await prisma.source.findUnique({ where: { rssUrl: source.rssUrl }, select: { id: true } });
    if (existing) {
      await prisma.source.update({ where: { id: existing.id }, data: { name: source.name, category: source.category } });
      updated++;
    } else {
      await prisma.source.create({
        data: { name: source.name, rssUrl: source.rssUrl, category: source.category, isActive: check.ok, lastError: check.ok ? null : `Seed check failed: ${check.note}` },
      });
      created++;
      if (!check.ok) inactive++;
    }
    console.log(`  ${check.ok ? "OK  " : "FAIL"} ${existing ? "updated" : "created"}  ${source.name.padEnd(36)} ${check.note}`);
  }

  console.log(`\nDone: ${created} created, ${updated} updated${inactive ? `, ${inactive} inserted as INACTIVE (feed check failed; fix the URL or remove it)` : ""}.`);
  if (inactive) exitCode = 3;
} catch (error) {
  console.error(`\nseed failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  exitCode = 1;
} finally {
  await disconnectDatabase().catch(() => undefined);
}
process.exit(exitCode);
