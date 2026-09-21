import { getBreakingItems } from "@/lib/breaking/queries";

// Current breaking stories as JSON. Used by the polling fallback and the periodic reconcile.
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await getBreakingItems();
  if (!items) {
    // Database unavailable: 503 tells clients to keep the list they already have.
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { items, serverTime: Date.now() },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=20" } },
  );
}
