// The actual ingestion pass: RSS -> AI -> publish -> social sweep. Runs as a Netlify BACKGROUND
// function (the "-background" filename suffix is what makes it one — this is the older but still
// fully supported convention; the installed @netlify/functions Config type does not (yet) type the
// newer `config.background` field, so the suffix is used instead) because a normal or scheduled
// function is capped at 26s / 30s — nowhere near enough for a full pass over every feed. Only ever
// invoked by trigger-ingest.mts (a scheduled function), never called from a browser.
//
// Netlify runs this on its own serverless infrastructure, not the long-running worker process
// apps/worker/src/index.ts describes: there is no persistent scheduler here, just one pass per call.
export default async (req: Request): Promise<Response> => {
  const secret = process.env.INGEST_TRIGGER_SECRET;
  if (!secret || req.headers.get("x-ingest-secret") !== secret) {
    // Wrong or missing secret: refuse silently rather than confirm an ingestion endpoint exists here.
    return new Response("Not found", { status: 404 });
  }

  const { runScheduledIngestion } = await import("@g12/worker/scheduled");
  const result = await runScheduledIngestion();
  if (result.reportText) console.log(result.reportText);
  if (result.social) console.log(`Social sweep: ${result.social.attempted} of ${result.social.checked} recent stories had a platform to try.`);
  if (!result.ok) console.error(`[ingest-background] ${result.message}`);

  // A background function's response is not read by anything (Netlify does not deliver it to a
  // caller): this only shows up in the function's own invocation log.
  return new Response(result.message, { status: result.ok ? 200 : 500 });
};
