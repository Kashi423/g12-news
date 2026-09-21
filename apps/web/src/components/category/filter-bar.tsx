import Link from "next/link";
import type { CategoryDef } from "@g12/config";
import { categoryHref, type CategoryQuery } from "@/lib/category/query";
import type { TagCount } from "@/lib/category/tags";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function Chip({ href, active, title, children }: { href: string; active: boolean; title?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      title={title}
      // aria-current="true" marks the chosen topic (a filter, not a page in a set of pages)
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-8 items-center whitespace-nowrap rounded-sm border px-3 text-[13px] font-semibold transition-colors ${focus} ${
        active ? "border-brand bg-brand text-white" : "border-line bg-canvas text-ink hover:border-brand hover:text-brand"
      }`}
    >
      {children}
    </Link>
  );
}

const SORTS = [
  { value: "recent", label: "Most recent" },
  { value: "viewed", label: "Most viewed" },
] as const;

/**
 * Topic chips (tags that recur in this category) and the most recent / most viewed toggle. They are
 * plain links: the choice lives in the URL, so it can be shared, bookmarked and used with Back.
 * Changing either one starts again from the first page.
 */
export function FilterBar({ category, tags, query }: { category: CategoryDef; tags: readonly TagCount[]; query: CategoryQuery }) {
  // A topic reached through a link stays visible (and clearable) even if it is not among the frequent ones.
  const chips = query.tag && !tags.some((t) => t.tag === query.tag) ? [{ tag: query.tag, count: 0 }, ...tags] : tags;

  return (
    <div data-testid="filter-bar" className="mb-6 flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      {chips.length > 0 && (
        <nav aria-label="Filter by topic" className="min-w-0 sm:flex-1">
          {/* A swipeable row on phones; wraps from `sm` up. Negative margins let it scroll edge to edge. */}
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            <li>
              <Chip href={categoryHref(category.slug, { sort: query.sort })} active={query.tag === null}>
                All
              </Chip>
            </li>
            {chips.map(({ tag }) => {
              const active = tag === query.tag;
              return (
                <li key={tag}>
                  <Chip
                    // Choosing the active topic again clears it.
                    href={categoryHref(category.slug, { sort: query.sort, tag: active ? null : tag })}
                    active={active}
                    title={active ? "Clear this filter" : undefined}
                  >
                    {tag}
                  </Chip>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <nav aria-label="Sort order" className="shrink-0 sm:ml-auto">
        <ul className="inline-flex border border-line">
          {SORTS.map(({ value, label }) => {
            const active = query.sort === value;
            return (
              <li key={value}>
                <Link
                  href={categoryHref(category.slug, { sort: value, tag: query.tag })}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex h-8 items-center whitespace-nowrap px-3 text-[13px] font-semibold transition-colors ${focus} focus-visible:-outline-offset-2 ${
                    active ? "bg-brand text-white" : "bg-canvas text-ink hover:bg-surface hover:text-brand"
                  }`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
