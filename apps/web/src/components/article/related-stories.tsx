import Link from "next/link";
import { categoryPath, type CategoryDef } from "@g12/config";
import type { HomeArticle } from "@/lib/home/types";
import { ArticleCard } from "../home/article-card";

/** More from the same category, using the same card as the homepage. Shows nothing when the category has no other story. */
export function RelatedStories({ stories, category }: { stories: readonly HomeArticle[]; category: CategoryDef }) {
  if (stories.length === 0) return null;

  return (
    <section aria-labelledby="related-heading" data-testid="related-stories" className="mt-12 border-t-2 border-brand pt-5">
      <div className="flex items-end justify-between gap-3">
        <h2 id="related-heading" className="font-serif text-2xl font-black tracking-tight text-brand">
          Related stories
        </h2>
        <Link href={categoryPath(category.slug)} className="shrink-0 pb-0.5 text-sm font-semibold text-crimson hover:underline">
          More {category.name} <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
      <ul className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {stories.map((story) => (
          <li key={story.id}>
            <ArticleCard article={story} />
          </li>
        ))}
      </ul>
    </section>
  );
}
