import { relativeTime } from "./breaking/time";

/**
 * Small DOM helpers behind PageEnhancements. They touch the page directly, so a page full of story cards
 * needs one script instead of a hydrated component per card.
 */

/** A picture that failed to load (the outlet blocks it, or removed it): hide it and show the G12 News logo card behind it. */
export function showImageFallback(img: HTMLImageElement): void {
  if (img.dataset.fallback === undefined) return;
  img.style.display = "none";
  const card = img.nextElementSibling;
  if (card instanceof HTMLElement && card.hasAttribute("data-fallback-box")) card.hidden = false;
}

/** Pictures whose failure happened before the script started listening. */
export function showFailedImageFallbacks(root: ParentNode = document): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-fallback]")) {
    if (img.complete && img.naturalWidth === 0) showImageFallback(img);
  }
}

/** Rewrite every "x minutes ago" on the page (the `time[data-relative]` elements) for the current moment. */
export function refreshRelativeTimes(now: number = Date.now(), root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLTimeElement>("time[data-relative]")) {
    const text = relativeTime(el.dateTime, now);
    const node = el.firstChild;
    // Change the existing text node (rather than replacing it), so React, which knows that node, stays consistent.
    if (node?.nodeType === Node.TEXT_NODE && node.nodeValue !== text) node.nodeValue = text;
  }
}
