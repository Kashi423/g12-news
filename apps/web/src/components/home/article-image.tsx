import { getImageProps } from "next/image";
import { isOptimizableImage } from "@/lib/images";
import { ImagePlaceholder } from "./image-placeholder";

/**
 * The attributes for a story's picture, made by next/image's own `getImageProps`, so it is resized,
 * converted to a modern format and served in several widths exactly as <Image> would do it. The difference
 * is that this is a plain <img> in the page's HTML: it costs no JavaScript to hydrate, and there can be
 * dozens of them on a page. (Pictures from hosts we have not approved are served as they are, so the
 * image optimizer can never be used as an open proxy.)
 *
 * `quality`: 60 is plenty for the small cards; the big top-of-page picture asks for 75.
 */
export function articleImageProps({ src, sizes, eager = false, quality = 60 }: { src: string; sizes: string; eager?: boolean; quality?: 60 | 75 }) {
  return getImageProps({
    src,
    alt: "",
    fill: true,
    sizes,
    quality,
    className: "object-cover",
    unoptimized: !isOptimizableImage(src),
    loading: eager ? "eager" : "lazy",
    fetchPriority: eager ? "high" : "auto",
  }).props;
}

/**
 * A story's picture, filling its relatively positioned, fixed-aspect parent (so the space is reserved
 * before the picture arrives and nothing shifts). No picture: the logo card. A picture that fails to load
 * is swapped for the logo card by PageEnhancements (the card sits right behind it, hidden until needed).
 */
export function ArticleImage({ src, sizes, eager = false, quality }: { src: string | null; sizes: string; eager?: boolean; quality?: 60 | 75 }) {
  if (!src) return <ImagePlaceholder />;
  return (
    <>
      {/* A plain <img> on purpose: its attributes come from next/image (see articleImageProps). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...articleImageProps({ src, sizes, eager, quality })} alt="" data-fallback="" />
      <ImagePlaceholder hidden />
    </>
  );
}
