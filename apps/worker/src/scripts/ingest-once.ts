// One manual ingestion pass with readable console output — no scheduler involved.
//   npm run ingest:once                   full pass
//   npm run ingest:dry                    fetch + screen only: no AI calls, nothing saved
//   npm run ingest:sample                 at most 2 new items per source (cheap first test)
// Other flags go after `--` (bash/cmd) or after `'--'` (PowerShell strips a bare `--`):
//   npm run ingest:once -- --source=dawn  only sources whose name/URL contains "dawn"
//   npm run ingest:once -- --limit=5      at most 5 new items per source
//   npm run ingest:once -- --force        ignore the 10-minute per-feed minimum interval
import "../env";
import { formatReport } from "../ingest/report";
import { runIngestion } from "../ingest/pipeline";
import { usage } from "../lib/ai";
import { aiLabel } from "../lib/provider";
import { createRunDeps, disconnectDatabase, missingEnv } from "../runtime";
import { publishPendingArticles } from "../social";

function flagValue(args: string[], name: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1]!.startsWith("--") ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: npm run ingest:once -- [--dry-run] [--force] [--limit=N] [--source=TEXT]");
  console.log("Shortcuts: npm run ingest:dry | npm run ingest:sample");
  console.log("PowerShell strips a bare `--`; write: npm run ingest:once '--' --limit=5");
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
const limit = flagValue(args, "limit");
const sourceFilter = flagValue(args, "source");
const maxItemsPerSource = limit ? Number.parseInt(limit, 10) : undefined;
if (limit && (!Number.isFinite(maxItemsPerSource) || maxItemsPerSource! < 1)) {
  console.error(`--limit must be a positive integer (got "${limit}")`);
  process.exit(2);
}

const missing = missingEnv({ needsAi: !dryRun });
if (missing.length) {
  console.error(`Missing or invalid environment setting(s): ${missing.join("; ")}\nCopy .env.example to .env in the repo root and fill them in.`);
  process.exit(1);
}

let exitCode = 0;
try {
  console.log(`G12 News ingest:once  ${new Date().toISOString()}`);
  console.log(`mode: ${dryRun ? "DRY RUN (no AI calls, nothing saved)" : "LIVE"}${force ? " | force" : ""} | AI: ${aiLabel()}${sourceFilter ? ` | source filter: "${sourceFilter}"` : ""}`);
  console.log("");

  const deps = await createRunDeps((line) => console.log(line));
  const report = await runIngestion(deps, { dryRun, force, maxItemsPerSource, sourceFilter });

  console.log("");
  console.log(formatReport(report));
  if (usage.calls > 0) {
    console.log(`AI usage: ${usage.calls} call(s), ${usage.inputTokens.toLocaleString()} input tokens, ${usage.outputTokens.toLocaleString()} output tokens`);
  }
  if (!dryRun) {
    const social = await publishPendingArticles();
    if (social.attempted > 0) console.log(`Social posts: ${social.attempted} of ${social.checked} recent live stories had a platform to try.`);
  }
} catch (error) {
  console.error(`\ningest:once failed: ${error instanceof Error ? (error.stack ?? error.message) : error}`);
  exitCode = 1;
} finally {
  await disconnectDatabase().catch(() => undefined);
}
process.exit(exitCode);
