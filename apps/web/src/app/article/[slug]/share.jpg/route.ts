import { getArticle } from "@/lib/article/queries";
import { shareImageFor } from "@/lib/seo/share-image";

// The story's share-preview picture (see lib/seo/share-image.ts): /article/<slug>/share.jpg
export const dynamic = "force-dynamic";

const SHARE_CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug).catch(() => null);
  if (!article) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  const jpeg = article.imageUrl ? await shareImageFor(article.imageUrl) : null;
  if (!jpeg) {
    // No picture, or it could not be fetched: the site's own preview image instead (briefly cached, so a
    // temporary outlet outage is not remembered for a day).
    return new Response(null, { status: 307, headers: { Location: new URL("/opengraph-image.jpg", request.url).toString(), "Cache-Control": "public, max-age=60" } });
  }
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length), "Cache-Control": SHARE_CACHE } });
}
