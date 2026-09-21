import Link from "next/link";
import { articlePath, CATEGORY_BY_ID } from "@g12/config";
import { isBreakingNow } from "@/lib/home/flags";
import { getFeaturedPool } from "@/lib/home/queries";
import { pickFeatured } from "@/lib/home/ranking";
import type { HomeArticle } from "@/lib/home/types";
import { BreakingBadge } from "../breaking/breaking-badge";
import { TimeAgo } from "./time-ago";
import { ArticleImage } from "./article-image";
import { ImagePlaceholder } from "./image-placeholder";

/**
 * Top of the homepage: the most recent high-urgency story large on the left (image, headline,
 * excerpt), and three smaller stories stacked on the right. On phones they simply stack.
 */
export async function Hero() {
  const { hero, secondary } = pickFeatured(await getFeaturedPool());
  if (!hero) return <HomeEmpty />;

  return (
    <section aria-label="Top stories" data-testid="hero" data-page-hero className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
      <article className="group lg:col-span-2">
        <Link href={articlePath(hero.slug)} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
            <ArticleImage src={hero.imageUrl} sizes="(min-width: 1024px) 66vw, 100vw" eager quality={75} />
            {isBreakingNow(hero) && <BreakingBadge pulse className="absolute left-3 top-3 shadow-sm" />}
          </div>
          <div className="mt-3 lg:mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-crimson">{CATEGORY_BY_ID[hero.category].name}</p>
            <h2 className="mt-1 line-clamp-4 font-serif text-[1.65rem] font-black leading-[1.15] tracking-tight group-hover:underline sm:text-4xl">{hero.title}</h2>
            <p className="mt-2 line-clamp-3 text-base leading-relaxed text-muted sm:text-lg">{hero.excerpt}</p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <span className="font-semibold uppercase tracking-wide text-ink/80">{hero.sourceName}</span>
              <span aria-hidden="true">&middot;</span>
              <TimeAgo iso={hero.publishedAt} />
            </p>
          </div>
        </Link>
      </article>

      {secondary.length > 0 && (
        // lg:grid-cols-1 makes the list's one column a fixed minmax(0,1fr) track. Left implicit ("auto"), it grew to fit the
        // longest unbreakable word in a headline and pushed the page wider than the window at ~1024px.
        <ul className="divide-y divide-line lg:grid lg:grid-cols-1 lg:grid-rows-3 lg:divide-y lg:border-l lg:border-line lg:pl-8">
          {secondary.map((story) => (
            <li key={story.id} className="py-4 first:pt-0 last:pb-0 lg:flex lg:items-center lg:py-0">
              <SideStory story={story} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SideStory({ story }: { story: HomeArticle }) {
  return (
    <Link href={articlePath(story.slug)} className="group flex w-full gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:py-4">
      <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden bg-surface sm:w-40 lg:w-32 xl:w-40">
        <ArticleImage src={story.imageUrl} sizes="(min-width: 1280px) 160px, (min-width: 640px) 160px, 112px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-crimson">{CATEGORY_BY_ID[story.category].name}</p>
        <h3 className="mt-0.5 line-clamp-3 font-serif text-base font-bold leading-snug [overflow-wrap:anywhere] group-hover:underline">{story.title}</h3>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="truncate font-semibold uppercase tracking-wide text-ink/80">{story.sourceName}</span>
          <span aria-hidden="true">&middot;</span>
          <TimeAgo iso={story.publishedAt} className="shrink-0" />
        </p>
      </div>
    </Link>
  );
}

/** Shown only when the database holds no published stories yet (a fresh install). */
function HomeEmpty() {
  return (
    <section aria-label="Top stories" data-testid="home-empty" className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface lg:col-span-2">
        <ImagePlaceholder />
      </div>
      <div className="flex flex-col justify-center lg:border-l lg:border-line lg:pl-8">
        <h2 className="font-serif text-2xl font-black text-brand">Stories are on the way</h2>
        <p className="mt-2 text-muted">The newsroom pipeline publishes stories automatically. This page fills in as soon as the first ones arrive.</p>
      </div>
    </section>
  );
}
