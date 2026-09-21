import Link from "next/link";
import { categoryHref, type CategoryQuery } from "@/lib/category/query";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const buttonClass = `inline-flex items-center justify-center gap-1.5 border border-brand px-3 py-2.5 text-sm font-bold uppercase tracking-wide text-brand transition-colors hover:bg-brand hover:text-white sm:px-4 ${focus}`;

/** A label that drops the word "stories" on phones so two buttons always fit side by side (even at 320px). */
function Label({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{long}</span>
    </>
  );
}

/**
 * "Newer / Older stories" links under the list. Each link carries a cursor (the story at the edge of
 * this page) in the URL, so paging never skips or repeats a story, and works without JavaScript.
 * Under the "most viewed" sort the direction is not about time, so the wording is neutral.
 *
 * Phones: Newer and Older share one row, with "First page" centred beneath. From `sm` up: one row.
 */
export function Pagination({ slug, query, olderCursor, newerCursor }: { slug: string; query: CategoryQuery; olderCursor: string | null; newerCursor: string | null }) {
  if (!olderCursor && !newerCursor) return null;
  const keep = { sort: query.sort, tag: query.tag };
  const byDate = query.sort === "recent";

  return (
    <nav aria-label="More stories" data-testid="pagination" className="mt-10 grid grid-cols-2 items-center gap-x-3 gap-y-4 border-t border-line pt-6 sm:flex sm:justify-between sm:gap-x-4">
      {newerCursor ? (
        <Link href={categoryHref(slug, { ...keep, before: newerCursor })} rel="prev" className={buttonClass}>
          <span aria-hidden="true">&larr;</span> {byDate ? <Label short="Newer" long="Newer stories" /> : "Previous"}
        </Link>
      ) : (
        <span />
      )}
      {newerCursor && (
        <Link
          href={categoryHref(slug, keep)}
          className={`order-last col-span-2 text-center text-sm font-semibold text-muted hover:text-brand hover:underline sm:order-none sm:col-span-1 ${focus}`}
        >
          First page
        </Link>
      )}
      {olderCursor ? (
        <Link href={categoryHref(slug, { ...keep, after: olderCursor })} rel="next" className={buttonClass}>
          {byDate ? <Label short="Older" long="Older stories" /> : <Label short="More" long="More stories" />} <span aria-hidden="true">&rarr;</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
