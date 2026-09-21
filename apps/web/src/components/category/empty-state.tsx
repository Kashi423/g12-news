import Link from "next/link";
import type { CategoryDef } from "@g12/config";
import { categoryHref } from "@/lib/category/query";

const buttonClass =
  "inline-block bg-brand px-5 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function Panel({ testId, title, children }: { testId: string; title: string; children: React.ReactNode }) {
  return (
    <div data-testid={testId} className="flex flex-col items-center border border-dashed border-line bg-surface px-6 py-14 text-center">
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand/40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5Z" />
        <path d="M19 9h1a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2M8 9h7M8 13h7M8 16h4" />
      </svg>
      <h2 className="mt-4 font-serif text-2xl font-black tracking-tight text-brand">{title}</h2>
      {children}
    </div>
  );
}

/** A category that has no published stories at all: not an error, just a quiet page with a way onward. */
export function NoStoriesYet({ category }: { category: CategoryDef }) {
  return (
    <Panel testId="category-empty" title="No stories yet">
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        There are no {category.name} stories at the moment. They appear here automatically as soon as they are published, so check back soon.
      </p>
      <Link href="/" className={`mt-6 ${buttonClass}`}>
        Back to the homepage
      </Link>
    </Panel>
  );
}

/** A topic filter (say, from an old link) that matches nothing in a category that does have stories. */
export function NoMatchingStories({ category, tag, sort }: { category: CategoryDef; tag: string; sort: "recent" | "viewed" }) {
  return (
    <Panel testId="category-no-match" title="No matching stories">
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        There are no {category.name} stories tagged &ldquo;{tag}&rdquo; right now.
      </p>
      <Link href={categoryHref(category.slug, { sort })} className={`mt-6 ${buttonClass}`}>
        Show all {category.name} stories
      </Link>
    </Panel>
  );
}
