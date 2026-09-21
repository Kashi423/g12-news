"use client";

import { useCallback, useState } from "react";
import { ArticleImage } from "../home/article-image";

/**
 * The story's picture with its credit line, when the feed gave one. A story with no picture shows no
 * hero at all (a big logo card would say nothing), and so does one whose picture fails to load (the
 * outlet blocks hotlinking, or removed it): the credit never sits under an empty box.
 */
export function ArticleHero({ src, credit }: { src: string | null; credit: string | null }) {
  const [failed, setFailed] = useState(false);
  const onFailed = useCallback(() => setFailed(true), []);
  if (!src || failed) return null;

  return (
    <figure className="mt-5" data-testid="article-hero">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
        <ArticleImage src={src} sizes="(min-width: 1024px) 736px, 100vw" eager onFailed={onFailed} />
      </div>
      {credit && (
        <figcaption data-testid="image-credit" className="mt-1.5 text-xs text-muted">
          Photo: {credit}
        </figcaption>
      )}
    </figure>
  );
}
