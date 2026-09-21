import { computeAlerts } from "@/lib/admin/alerts";
import { safeEqual } from "@/lib/admin/auth";
import { getHealthSnapshot } from "@/lib/admin/data";

/**
 * The alerting hook: what an uptime monitor polls so the owner is told BEFORE a reader notices a dead pipeline.
 *
 *   GET /api/admin/health?token=<HEALTH_CHECK_TOKEN>      (or the header "Authorization: Bearer <token>")
 *
 *   200 {"ok":true,...}    the pipeline is healthy
 *   503 {"ok":false,...}   at least one warning is active (the same ones as the banners on /admin), or the
 *                          database cannot be read; "alerts" says what
 *
 * Point a free monitor (UptimeRobot, Better Stack, Healthchecks.io ...) at it and let the monitor send the email,
 * SMS or push notification. Without HEALTH_CHECK_TOKEN in .env the endpoint does not exist (404), and a wrong
 * token gets the same 404, so it does not advertise itself.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
const notFound = () => new Response("Not found", { status: 404, headers: NO_STORE });

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.HEALTH_CHECK_TOKEN?.trim();
  if (!expected) return notFound();
  const given = new URL(request.url).searchParams.get("token") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(given.trim(), expected)) return notFound();

  const checkedAt = new Date();
  try {
    const snapshot = await getHealthSnapshot(checkedAt);
    const alerts = computeAlerts(snapshot);
    return Response.json(
      {
        ok: alerts.length === 0,
        checkedAt: checkedAt.toISOString(),
        requireReview: snapshot.requireReview,
        pendingReview: snapshot.pendingCount,
        alerts: alerts.map(({ id, level, title, detail, items }) => ({ id, level, title, detail, items })),
      },
      { status: alerts.length === 0 ? 200 : 503, headers: NO_STORE },
    );
  } catch (error) {
    // A database that cannot be read is exactly what the monitor is there to report.
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, checkedAt: checkedAt.toISOString(), alerts: [{ id: "database", level: "error", title: "The database cannot be read", detail: message.slice(0, 300), items: [] }] }, { status: 503, headers: NO_STORE });
  }
}
