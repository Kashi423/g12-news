/**
 * How far through a story the reader is, from 0 to 1, for the reading-progress bar.
 *
 * `top` is the story's top edge relative to the viewport (negative once it has scrolled past the top).
 * The bar starts filling as the story's top reaches the top of the screen and is full once its end has
 * scrolled up to the middle of the screen, which is where a reader who has finished it is looking.
 */
export function readingProgress(top: number, height: number, viewportHeight: number): number {
  const distance = Math.max(height - viewportHeight * 0.5, 1);
  const progress = -top / distance;
  if (!Number.isFinite(progress)) return 0;
  return Math.min(1, Math.max(0, progress));
}
