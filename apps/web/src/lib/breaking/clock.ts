/** The current time. A function of its own so components can ask for it without reading the clock directly. */
export function currentTime(): number {
  return Date.now();
}
