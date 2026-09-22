import type { Config } from "@netlify/functions";

// Fires every 30 minutes (see `config.schedule` below) and does nothing but kick off
// ingest-background.mts. Kept separate because a *scheduled* function is capped at 30 seconds, far
// too short for a real ingestion pass; a *background* function allows 15 minutes but cannot be put
// on a cron schedule directly, so this thin trigger bridges the two. Netlify responds to the
// background invocation immediately (202 Accepted) and keeps running it after this function returns.
export default async (): Promise<Response> => {
  const base = process.env.URL; // Netlify's own env var: this site's canonical production URL
  const secret = process.env.INGEST_TRIGGER_SECRET;
  if (!base || !secret) {
    console.error("[trigger-ingest] URL or INGEST_TRIGGER_SECRET is not set; skipping.");
    return new Response("Not configured", { status: 500 });
  }
  try {
    const response = await fetch(`${base}/.netlify/functions/ingest-background`, { method: "POST", headers: { "x-ingest-secret": secret } });
    return new Response(`Triggered: HTTP ${response.status}`, { status: 200 });
  } catch (error) {
    console.error(`[trigger-ingest] could not reach ingest-background: ${error instanceof Error ? error.message : error}`);
    return new Response("Trigger failed", { status: 502 });
  }
};

export const config: Config = { schedule: "*/30 * * * *" };
