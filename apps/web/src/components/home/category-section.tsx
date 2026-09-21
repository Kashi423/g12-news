import Link from "next/link";
import { categoryPath, CATEGORY_BY_ID, type CategoryId } from "@g12/config";
import { getCategoryArticles, getFeaturedPool } from "@/lib/home/queries";
import { pickFeatured, sectionArticles, sectionDisplayCount } from "@/lib/home/ranking";
import { ArticleCard } from "./article-card";

/** Grid columns at desktop widths, by number of cards (static strings so Tailwind can see them). */
const GRID_BY_COUNT: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2",
  5: "sm:grid-cols-2 lg:grid-cols-3",
  6: "sm:grid-cols-2 lg:grid-cols-3",
};

/**
 * One category's latest 4-6 stories (not repeating anything already featured in the hero), with a
 * "View all" link to the category page. On phones the cards sit in a swipeable row.
 */
export async function CategorySection({ categoryId }: { categoryId: CategoryId }) {
  const [pool, latest] = await Promise.all([getFeaturedPool(), getCategoryArticles(categoryId)]);
  const { hero, secondary } = pickFeatured(pool);
  const featuredIds = new Set([hero, ...secondary].flatMap((a) => (a ? [a.id] : [])));
  const stories = sectionArticles(categoryId, latest, featuredIds);
  const shown = stories.slice(0, sectionDisplayCount(stories.length));
  if (shown.length === 0) return null;

  const category = CATEGORY_BY_ID[categoryId];
  const headingId = `section-${category.slug}`;
  return (
    <section aria-labelledby={headingId} data-testid={`section-${category.slug}`}>
      <div className="mb-4 flex items-end justify-between gap-3 border-b-2 border-brand pb-2">
        <h2 id={headingId} className="font-serif text-2xl font-black tracking-tight text-brand">
          {category.name}
        </h2>
        <Link href={categoryPath(category.slug)} className="shrink-0 pb-0.5 text-sm font-semibold text-crimson hover:underline">
          View all {category.name} <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
      <ul
        className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:grid sm:gap-x-5 sm:gap-y-7 sm:overflow-visible sm:px-0 sm:pb-0 ${GRID_BY_COUNT[shown.length]}`}
      >
        {shown.map((story) => (
          <li key={story.id} className="w-[76%] shrink-0 snap-start sm:w-auto">
            <ArticleCard article={story} />
          </li>
        ))}
      </ul>
    </section>
  );
}
