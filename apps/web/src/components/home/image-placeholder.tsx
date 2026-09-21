/**
 * Stand-in for a story with no picture: the G12 News logo on its own backdrop (a card the size of its
 * relatively positioned parent). It is a background image, not an <img>, so it costs nothing to render:
 * with `hidden` (the default beside a real picture) the browser does not even download the file, and
 * PageEnhancements un-hides it only if that picture fails to load.
 * The file is public/brand/g12-news-placeholder.jpg (made by `npm run brand:build`); if you rename it,
 * change the class below to match.
 */
export function ImagePlaceholder({ hidden = false }: { hidden?: boolean }) {
  return (
    <span
      aria-hidden="true"
      hidden={hidden}
      data-fallback-box=""
      data-testid="image-placeholder"
      className="absolute inset-0 bg-[#eeeeee] bg-cover bg-center bg-[url('/brand/g12-news-placeholder.jpg')]"
    />
  );
}
