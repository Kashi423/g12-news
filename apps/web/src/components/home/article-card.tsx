import Link from "next/link";
import { articlePath } from "@g12/config";
import { isBreakingNow } from "@/lib/home/flags";
import type { HomeArticle } from "@/lib/home/types";
import { BreakingBadge } from "../breaking/breaking-badge";
import { RelativeTime } from "../breaking/relative-time";
import { ArticleImage } from "./article-image";

/** Image sizes for a card in a category section, so the browser downloads a right-sized picture. */
export const CARD_IMAGE_SIZES = "(min-width: 1024px) 28vw, (min-width: 640px) 46vw, 76vw";

/** Story card: image, headline, excerpt, source and relative time. Breaking stories carry the BREAKING badge. */
export function ArticleCard({ article }: { article: HomeArticle }) {
  const breaking = isBreakingNow(article);
  return (
    <article className="group h-full">
      <Link href={articlePath(article.slug)} className="flex h-full flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface">
          <ArticleImage src={article.imageUrl} sizes={CARD_IMAGE_SIZES} />
          {breaking && <BreakingBadge pulse className="absolute left-2 top-2 shadow-sm" />}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 pt-3">
          <h3 className="line-clamp-3 font-serif text-[17px] font-bold leading-snug group-hover:underline">{article.title}</h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{article.excerpt}</p>
          <p className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-muted">
            <span className="truncate font-semibold uppercase tracking-wide text-ink/80">{article.sourceName}</span>
            <span aria-hidden="true">&middot;</span>
            <RelativeTime iso={article.publishedAt} className="shrink-0" />
          </p>
        </div>
      </Link>
    </article>
  );
}
