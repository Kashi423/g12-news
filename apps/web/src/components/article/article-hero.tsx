"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { articleImageProps } from "../home/article-image";

/**
 * The story's picture with its credit line, when the feed gave one. A story with no picture shows no
 * hero at all (a big logo card would say nothing), and so does one whose picture fails to load (the
 * outlet blocks hotlinking, or removed it): the credit never sits under an empty box.
 */
export function ArticleHero({ src, credit }: { src: string | null; credit: string | null }) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const fail = useCallback(() => setFailed(true), []);

  // A picture can fail before React attaches onError (the page was already on screen); catch that here.
  useEffect(() => {
    const img = image.current;
    if (img && img.complete && img.naturalWidth === 0) fail();
  }, [fail]);

  if (!src || failed) return null;
  const props = articleImageProps({ src, sizes: "(min-width: 1024px) 736px, 100vw", eager: true, quality: 75 });

  return (
    <figure className="mt-5" data-testid="article-hero" data-page-hero>
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
        {/* next/image's attributes on a plain <img>, so a failure can hide the whole figure (see articleImageProps). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={image} {...props} alt="" onError={fail} />
      </div>
      {credit && (
        <figcaption data-testid="image-credit" className="mt-1.5 text-xs text-muted">
          Photo: {credit}
        </figcaption>
      )}
    </figure>
  );
}
