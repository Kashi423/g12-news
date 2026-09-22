import Link from "next/link";
import { categoryPath, type CategoryDef } from "@g12/config";
import { formatStoryTime, wasUpdated } from "@/lib/article/time";
import type { ArticleDetail } from "@/lib/article/types";
import { BreakingBadge } from "../breaking/breaking-badge";
import { TimeAgo } from "../home/time-ago";

/** The name every story is published under: there is no human reporter to credit, and the page says so. */
export const BYLINE = "G12 News Desk";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/**
 * Category and breaking badges, the headline, the byline and the times. Deliberately no mention of AI
 * anywhere on the public page (how a story was produced is an internal/admin detail, not a reader-facing
 * label): see the source attribution at the end of the article instead, which is what a reader needs —
 * where the reporting actually came from.
 */
export function ArticleHeader({ article, category, breaking }: { article: ArticleDetail; category: CategoryDef; breaking: boolean }) {
  const updated = wasUpdated(article.publishedAt, article.correctedAt);
  return (
    <header>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={categoryPath(category.slug)}
          data-testid="category-badge"
          className={`rounded-sm bg-brand px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.12em] text-white hover:bg-brand-800 ${FOCUS}`}
        >
          {category.name}
        </Link>
        {breaking && (
          <span data-testid="breaking-badge">
            <BreakingBadge pulse className="py-1" />
          </span>
        )}
      </div>

      <h1 data-testid="article-title" className="mt-3 text-balance font-serif text-[1.75rem] font-black leading-[1.2] tracking-tight text-ink sm:text-4xl lg:text-[2.5rem]">
        {article.title}
      </h1>

      <div className="mt-4 space-y-1 border-y border-line py-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span data-testid="byline" className="font-bold text-ink">
            By {BYLINE}
          </span>
        </p>
        <p className="text-muted">
          <time dateTime={article.publishedAt} data-testid="published-time">
            {formatStoryTime(article.publishedAt)}
          </time>
          <span aria-hidden="true"> &middot; </span>
          <TimeAgo iso={article.publishedAt} />
        </p>
        {updated && article.correctedAt && (
          <p className="text-muted" data-testid="updated-time">
            Updated{" "}
            <time dateTime={article.correctedAt} className="font-medium text-ink/80">
              {formatStoryTime(article.correctedAt)}
            </time>
          </p>
        )}
      </div>
    </header>
  );
}
