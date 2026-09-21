import { LOGO_CROP } from "./brand.generated";

/**
 * The G12 News logo files (apps/web/public/brand/). The artwork is the exact supplied logo; the
 * files below are made from it by `npm run brand:build -w @g12/web`.
 *
 * Master files, kept untouched for future use:
 *   /brand/g12-news-logo.svg   the supplied SVG
 *   /brand/g12-news-logo.jpg   the supplied 1254 x 1254 image (the artwork embedded in that SVG; grey backdrop)
 * Same artwork on a true white backdrop (logo pixels unchanged):
 *   /brand/g12-news-logo-white.png
 */
export const LOGO = {
  /** Logo on white with a small margin: header and footer. The file name is versioned by the build script. */
  ...LOGO_CROP,
  alt: "G12 News",
} as const;

/**
 * The site-wide link-preview picture (apps/web/src/app/opengraph-image.jpg, which Next.js serves at this
 * address). A story with no picture of its own is shared with this one, so its WhatsApp, Facebook or X
 * preview is never empty.
 */
export const SHARE_IMAGE = {
  src: "/opengraph-image.jpg",
  width: 1200,
  height: 630,
  alt: "G12 News: Pakistan, As It Happens",
} as const;

/** 16:10 card shown where a story has no image. Already sized for its slot, so it is served as-is. */
export const LOGO_PLACEHOLDER = {
  src: "/brand/g12-news-placeholder.jpg",
  width: 1200,
  height: 750,
} as const;
