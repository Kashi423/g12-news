import type { RunReport, SourceReport } from "./pipeline";
import { plain } from "./text";

const pad = (value: string | number, width: number) => String(value).padStart(width);

/** Plain-ASCII summary table of one run (safe for any console). */
export function formatReport(report: RunReport): string {
  const rows = report.sources.filter((s) => !s.notDue);
  const idle = report.sources.length - rows.length;
  const lines: string[] = [];
  lines.push(`${"Source".padEnd(36)} ${pad("found", 5)} ${pad("publ", 5)} ${pad("rej", 4)} ${pad("dup", 4)} ${pad("seen", 5)} ${pad("old", 4)} ${pad("cap", 4)} ${pad("err", 4)}`);
  lines.push("-".repeat(79));

  const totals: Omit<SourceReport, "sourceId" | "name" | "notDue" | "error" | "firstAiError"> = {
    found: 0, published: 0, queued: 0, rejected: 0, duplicates: 0, alreadyIngested: 0, tooOld: 0, deferred: 0, invalid: 0, aiErrors: 0, deferredByAi: 0, planned: 0,
  };
  for (const r of rows) {
    lines.push(
      `${r.name.slice(0, 36).padEnd(36)} ${pad(r.found, 5)} ${pad(r.published, 5)} ${pad(r.rejected, 4)} ${pad(r.duplicates, 4)} ${pad(r.alreadyIngested, 5)} ${pad(r.tooOld, 4)} ${pad(r.deferred, 4)} ${pad(r.aiErrors + (r.error ? 1 : 0), 4)}`,
    );
    if (r.error) lines.push(`    ! feed error: ${r.error}`);
    else if (r.aiErrors) lines.push(`    ! ${r.aiErrors} AI error(s): ${r.firstAiError}`);
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += r[key];
  }
  lines.push("-".repeat(79));
  lines.push(
    `${"TOTAL".padEnd(36)} ${pad(totals.found, 5)} ${pad(totals.published, 5)} ${pad(totals.rejected, 4)} ${pad(totals.duplicates, 4)} ${pad(totals.alreadyIngested, 5)} ${pad(totals.tooOld, 4)} ${pad(totals.deferred, 4)} ${pad(totals.aiErrors + rows.filter((r) => r.error).length, 4)}`,
  );
  lines.push("");
  lines.push("publ = accepted (live now, or waiting for review) | rej = rejected by the AI | dup = same story as an earlier article");
  if (totals.queued > 0) lines.push(`REVIEW IS ON: ${totals.queued} of the ${totals.published} accepted stor${totals.published === 1 ? "y is" : "ies are"} waiting for approval in /admin and not live yet.`);
  lines.push("seen = already stored | old = past the age limit | cap = over the per-run cap (picked up next run) | err = errors");
  if (report.aiUnavailable) {
    const deferred = rows.reduce((n, r) => n + r.deferredByAi, 0);
    lines.push(`AI UNAVAILABLE: ${report.aiUnavailable}`);
    lines.push(`${deferred} item(s) were not analyzed and will be retried on the next run.`);
  }
  if (idle) lines.push(`${idle} source(s) not fetched: polled less than 10 minutes ago (use --force to override).`);
  if (report.dryRun) lines.push(`DRY RUN: ${totals.planned} item(s) would be sent to the AI; nothing was saved.`);
  const seconds = ((report.finishedAt.getTime() - report.startedAt.getTime()) / 1000).toFixed(1);
  lines.push(`Finished in ${seconds}s.`);
  return plain(lines.join("\n"));
}
