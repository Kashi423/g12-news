import Link from "next/link";
import { articlePath } from "@g12/config";
import { isBreakingNow } from "@/lib/home/flags";
import type { HomeArticle } from "@/lib/home/types";
import { BreakingBadge } from "../breaking/breaking-badge";
import { TimeAgo } from "./time-ago";
import { ArticleImage } from "./article-image";

/** Image sizes for a card in a category section, so the browser downloads a right-sized picture. */
export const CARD_IMAGE_SIZES = "(min-width: 1024px) 28vw, (min-width: 640px) 46vw, 76vw";

/**
 * Story card: image, headline, excerpt, source and relative time. Breaking stories carry the BREAKING badge.
 *
 * `eager`: the card is at the top of the page, so its picture is loaded at once and at high priority (it is
 * probably the page's largest paint); every other card's picture waits until it nears the screen.
 * `headingLevel`: cards under a section heading (the homepage) use h3; cards straight under the page's h1 use h2.
 */
export function ArticleCard({ article, eager = false, headingLevel: Heading = "h3" }: { article: HomeArticle; eager?: boolean; headingLevel?: "h2" | "h3" }) {
  const breaking = isBreakingNow(article);
  return (
    <article className="group h-full">
      <Link href={articlePath(article.slug)} className="flex h-full flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface">
          <ArticleImage src={article.imageUrl} sizes={CARD_IMAGE_SIZES} eager={eager} />
          {breaking && <BreakingBadge pulse className="absolute left-2 top-2 shadow-sm" />}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 pt-3">
          <Heading className="line-clamp-3 font-serif text-[17px] font-bold leading-snug group-hover:underline">{article.title}</Heading>
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{article.excerpt}</p>
          <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-muted">
            <span className="truncate font-semibold uppercase tracking-wide text-ink/80">{article.sourceName}</span>
            <span aria-hidden="true">&middot;</span>
            <TimeAgo iso={article.publishedAt} className="shrink-0" />
          </p>
        </div>
      </Link>
    </article>
  );
}
