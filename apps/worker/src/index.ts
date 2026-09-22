import "./env";
import { CATEGORIES, SITE, SOURCES } from "@g12/config";
import { formatReport } from "./ingest/report";
import { runIngestion } from "./ingest/pipeline";
import { aiLabel } from "./lib/provider";
import { createRunDeps, disconnectDatabase, missingEnv } from "./runtime";
import { startScheduler } from "./scheduler";
import { loadSettings } from "./settings";
import { publishPendingArticles } from "./social";

// Long-running worker: runs one ingestion pass at start-up, then one every INGEST_INTERVAL_MINUTES.
// To test a single pass first, use `npm run ingest:once`.
const stamp = () => new Date().toISOString();
const log = (line: string) => console.log(line); // the pipeline already converts its lines to plain ASCII

const missing = missingEnv({ needsAi: true });
if (missing.length) {
  console.error(`[worker] Missing or invalid environment setting(s): ${missing.join("; ")}\nCopy .env.example to .env in the repo root and fill them in.`);
  process.exit(1);
}

const settings = loadSettings();
const deps = await createRunDeps(log);
console.log(`[worker] ${SITE.name} worker starting: ${SOURCES.length} starter sources, ${CATEGORIES.length} categories, AI: ${aiLabel()}`);

let running = false;
async function runOnce(): Promise<void> {
  if (running) {
    console.log(`[worker] ${stamp()} previous pass still running; skipping this tick`);
    return;
  }
  running = true;
  try {
    console.log(`[worker] ${stamp()} ingestion pass starting`);
    const report = await runIngestion(deps);
    console.log(formatReport(report));
    // Social posting only happens once a story has cleared the full workflow (requirement #14); a
    // sweep after every pass covers both stories just published outright and any that a previous
    // sweep's platform attempt failed for.
    const social = await publishPendingArticles().catch((error: unknown) => {
      console.error(`[worker] ${stamp()} social-post sweep failed: ${error instanceof Error ? error.message : error}`);
      return null;
    });
    if (social && social.attempted > 0) console.log(`[worker] ${stamp()} social-post sweep: ${social.attempted} of ${social.checked} recent stories had a platform to try`);
  } catch (error) {
    console.error(`[worker] ${stamp()} ingestion pass failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  } finally {
    running = false;
  }
}

const scheduler = await startScheduler({ intervalMinutes: settings.intervalMinutes, redisUrl: process.env.REDIS_URL || undefined, run: runOnce, log });
console.log(`[worker] scheduler: ${scheduler.kind === "bullmq" ? "BullMQ repeatable job (Redis)" : "node-cron (in-process; set REDIS_URL to use BullMQ)"}, every ${settings.intervalMinutes} minutes`);

// BullMQ fires the first run immediately by itself; with node-cron the first run would otherwise be up to a full interval away.
if (scheduler.kind === "cron" && process.env.INGEST_ON_START !== "false") void runOnce();

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down`);
  await scheduler.stop().catch(() => undefined);
  while (running) await new Promise((resolve) => setTimeout(resolve, 500)); // let the current pass finish
  await disconnectDatabase().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
