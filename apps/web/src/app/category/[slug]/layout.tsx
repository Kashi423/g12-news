import { notFound } from "next/navigation";
import { categoryBySlug } from "@g12/config";

/**
 * Turns an unknown slug (/category/nope) into a real 404.
 *
 * It has to happen here, not in page.tsx: loading.tsx starts streaming the page's skeleton with a 200
 * status before page.tsx runs, so a notFound() thrown there could only ever be sent as a 200 "soft
 * 404". A layout runs before that loading boundary, so the status can still be set.
 * ("misc" never reaches this: next.config.mjs redirects it to "miscellaneous" first.)
 */
export default async function CategoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (!categoryBySlug((await params).slug)) notFound();
  return children;
}
