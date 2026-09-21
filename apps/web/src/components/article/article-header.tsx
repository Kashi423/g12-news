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
 * Category and breaking badges, the headline, the byline, the times, and the plain statement that an AI
 * wrote the story. The AI disclosure is part of the header on purpose: it is never tucked away.
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
          <span className="rounded-sm border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide text-brand">AI-generated</span>
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

      <p data-testid="ai-disclosure" className="mt-3 flex gap-2.5 rounded-sm bg-surface px-3 py-2.5 text-sm leading-relaxed text-muted">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>
          This story was written by AI as a short summary of reporting by <strong className="font-semibold text-ink">{article.sourceName}</strong>. No human reporter wrote it. For the full story,
          read the original.
        </span>
      </p>
    </header>
  );
}
