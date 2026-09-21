import Link from "next/link";
import type { CategoryDef } from "@g12/config";
import { categoryHref, parseTag } from "@/lib/category/query";

/**
 * The story's tags as chips. Each opens the story's category with that tag as the topic filter (the
 * same filtered view the category page's own topic chips give), so it lists more stories on the subject.
 */
export function TagChips({ tags, category }: { tags: readonly string[]; category: CategoryDef }) {
  // Only tags the category page would accept as a filter, each once.
  const usable = [...new Set(tags.map(parseTag).filter((tag): tag is string => tag !== null))];
  if (usable.length === 0) return null;

  return (
    <section aria-labelledby="tags-heading" data-testid="article-tags" className="mt-8">
      <h2 id="tags-heading" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
        Tags
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {usable.map((tag) => (
          <li key={tag}>
            <Link
              href={categoryHref(category.slug, { tag })}
              className="inline-block rounded-full border border-line bg-canvas px-3 py-1.5 text-sm text-ink hover:border-brand hover:bg-brand-50 hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true" className="text-muted">
                #
              </span>
              {tag}
              <span className="sr-only"> ({category.name} stories)</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
