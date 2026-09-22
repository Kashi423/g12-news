// One ingestion pass, callable (not a CLI script), for a serverless trigger — see
// apps/web/netlify/functions/ingest-background.mts, which is the only current caller.
// Imported as "@g12/worker/scheduled" (see this package's `exports`).
import { formatReport } from "./ingest/report";
import { runIngestion } from "./ingest/pipeline";
import { createRunDeps, disconnectDatabase, missingEnv } from "./runtime";
import { publishPendingArticles } from "./social";

export interface ScheduledIngestResult {
  ok: boolean;
  message: string;
  reportText?: string;
  social?: { checked: number; attempted: number };
}

/**
 * Fetch every due feed, screen, generate, save, then sweep for social posts — the same pipeline
 * `npm run ingest:once` runs locally, packaged for one serverless invocation. Always disconnects the
 * database before returning: a serverless instance is not guaranteed to be reused.
 */
export async function runScheduledIngestion(): Promise<ScheduledIngestResult> {
  const missing = missingEnv({ needsAi: true });
  if (missing.length) return { ok: false, message: `Missing environment setting(s): ${missing.join(", ")}` };

  const lines: string[] = [];
  try {
    const deps = await createRunDeps((line) => lines.push(line));
    const report = await runIngestion(deps);
    const reportText = formatReport(report);
    if (report.lockSkipped) return { ok: true, message: "Skipped: another ingestion pass was already running.", reportText };

    const social = await publishPendingArticles().catch((error: unknown) => {
      lines.push(`social-post sweep failed: ${error instanceof Error ? error.message : error}`);
      return null;
    });
    return { ok: true, message: "Ingestion pass complete.", reportText, social: social ?? undefined };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? (error.stack ?? error.message) : String(error) };
  } finally {
    await disconnectDatabase().catch(() => undefined);
  }
}
