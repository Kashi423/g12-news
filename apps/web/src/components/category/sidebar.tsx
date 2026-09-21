import { Suspense } from "react";
import Link from "next/link";
import { categoryPath, CATEGORIES, type CategoryId } from "@g12/config";
import { Trending } from "../home/trending";
import { TrendingSkeleton } from "../home/skeletons";

/** Links to every category except the one being viewed (so, 8 of the 9). */
export function CategoryLinks({ current }: { current: CategoryId }) {
  const others = CATEGORIES.filter((category) => category.id !== current);
  return (
    <nav aria-labelledby="more-sections-heading" data-testid="category-links" className="border border-line p-4 lg:p-5">
      <h2 id="more-sections-heading" className="mb-2 font-serif text-xl font-black tracking-tight text-brand">
        More sections
      </h2>
      <ul className="divide-y divide-line">
        {others.map((category) => (
          <li key={category.id}>
            <Link
              href={categoryPath(category.slug)}
              className="group flex items-center justify-between py-2.5 text-[15px] font-semibold hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
            >
              {category.name}
              <span aria-hidden="true" className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand">
                &rsaquo;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The category page sidebar: the five most-viewed stories sitewide (the homepage's Trending Now
 * panel, reused as it is) and links to the other categories. It sits below the stories on phones.
 */
export function CategorySidebar({ current }: { current: CategoryId }) {
  return (
    <aside aria-label="Trending and other sections" className="space-y-8">
      <Suspense fallback={<TrendingSkeleton />}>
        <Trending />
      </Suspense>
      <CategoryLinks current={current} />
    </aside>
  );
}
