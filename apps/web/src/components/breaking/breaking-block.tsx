"use client";

import Link from "next/link";
import { articlePath, BREAKING_BLOCK_COUNT, CATEGORY_BY_ID } from "@g12/config";
import { BreakingBadge, PulseDot } from "./breaking-badge";
import { useBreaking } from "./breaking-provider";
import { RelativeTime } from "./relative-time";

/** Height of the card row. Fixed, so the block takes the same space whatever it holds. */
const ROW = "h-[14rem]";

/**
 * The homepage's breaking-news section: the latest 3-4 breaking stories as cards, each with a red
 * top border, a BREAKING badge and a live "12 minutes ago". New stories slide in as the server
 * pushes them.
 *
 * It ALWAYS occupies the same height (a fixed-height row, and a quiet panel of that height when
 * nothing is breaking), so stories arriving or expiring never move the content below it. On phones
 * and tablets the cards sit in a swipeable row; from `lg` up they are a four-column grid.
 */
export function BreakingBlock() {
  const { items, liveIds } = useBreaking();
  const stories = items.slice(0, BREAKING_BLOCK_COUNT);

  return (
    <section aria-labelledby="breaking-heading" data-testid="breaking-block" data-empty={stories.length === 0} className="container py-6">
      <div className="mb-3 flex items-center gap-2.5">
        <PulseDot className={stories.length ? "bg-breaking" : "bg-line"} still={stories.length === 0} />
        <h2 id="breaking-heading" className={`font-serif text-xl font-black tracking-tight ${stories.length ? "text-breaking" : "text-muted"}`}>
          Breaking news
        </h2>
      </div>

      {stories.length === 0 ? (
        <div className={`${ROW} flex items-center justify-center border border-dashed border-line bg-surface px-6 text-center`}>
          <p className="max-w-md text-sm text-muted">No breaking stories at the moment. New developments appear here automatically, with no need to refresh.</p>
        </div>
      ) : (
        <ul aria-live="polite" className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 ${ROW}`}>
          {stories.map((story) => (
            <li key={story.id} className={`w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-auto ${liveIds.includes(story.id) ? "animate-breaking-in motion-reduce:animate-none" : ""}`}>
              <Link
                href={articlePath(story.slug)}
                className="group flex h-full flex-col gap-2 overflow-hidden border border-line border-t-4 border-t-breaking bg-canvas p-4 transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-breaking"
              >
                <div className="flex items-center justify-between gap-2">
                  <BreakingBadge />
                  <RelativeTime iso={story.publishedAt} className="text-xs font-medium text-muted" />
                </div>
                <h3 className="line-clamp-3 font-serif text-[17px] font-bold leading-snug group-hover:underline">{story.title}</h3>
                <p className="line-clamp-2 text-sm text-muted">{story.excerpt}</p>
                <p className="mt-auto truncate text-xs font-medium uppercase tracking-wide text-muted">
                  {CATEGORY_BY_ID[story.category].name} &middot; {story.sourceName}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
