"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { isOptimizableImage } from "@/lib/images";
import { ImagePlaceholder } from "./image-placeholder";

/**
 * A story's image via next/image (responsive sizes, lazy loading). Fills its relatively positioned,
 * fixed-aspect parent, so the space is reserved before the image arrives and nothing shifts.
 *
 * - Hosts we measured in the feeds are optimized by Next.js; any other host's image is served
 *   unoptimized so the optimizer can never be used as an open proxy.
 * - No image, or one that fails to load (hotlink blocked, deleted): the branded placeholder is shown.
 *   `onFailed` (optional) is also called then, for a caller that would rather show nothing.
 */
export function ArticleImage({ src, sizes, eager = false, onFailed }: { src: string | null; sizes: string; eager?: boolean; onFailed?: () => void }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  const fail = useCallback(() => {
    setFailed(true);
    onFailed?.();
  }, [onFailed]);

  // An image can fail before React hydrates, when onError has not been attached yet; catch that here.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) fail();
  }, [fail]);

  if (!src || failed) return <ImagePlaceholder />;
  return (
    <Image
      ref={ref}
      src={src}
      alt=""
      fill
      sizes={sizes}
      unoptimized={!isOptimizableImage(src)}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      onError={fail}
      className="object-cover"
    />
  );
}
