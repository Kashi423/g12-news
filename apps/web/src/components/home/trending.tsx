import Link from "next/link";
import { articlePath } from "@g12/config";
import { getTrending } from "@/lib/home/queries";
import { TimeAgo } from "./time-ago";

/** "Trending Now": the five most-viewed stories from the last 24 hours, numbered. */
export async function Trending() {
  const stories = await getTrending();
  if (stories.length === 0) return null;

  return (
    <section aria-labelledby="trending-heading" data-testid="trending" className="border border-line bg-surface p-4 lg:p-5">
      <h2 id="trending-heading" className="mb-3 flex items-center gap-2 font-serif text-xl font-black tracking-tight text-brand">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-crimson" fill="currentColor" aria-hidden="true">
          <path d="M13.5 0.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
        </svg>
        Trending Now
      </h2>
      <ol className="divide-y divide-line">
        {stories.map((story, index) => (
          <li key={story.id} className="py-3 first:pt-0 last:pb-0">
            <Link
              href={articlePath(story.slug)}
              className="group flex gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span aria-hidden="true" className="w-7 shrink-0 text-center font-serif text-3xl font-black leading-none text-crimson">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="line-clamp-3 font-serif text-[15px] font-bold leading-snug group-hover:underline">{story.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <span className="truncate font-semibold uppercase tracking-wide text-ink/80">{story.sourceName}</span>
                  <span aria-hidden="true">&middot;</span>
                  <TimeAgo iso={story.publishedAt} className="shrink-0" />
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
