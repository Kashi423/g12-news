import sharp from "sharp";
import { isOptimizableImage } from "../images";
import { SHARE_HEIGHT, SHARE_WIDTH } from "./share-image-size";

/**
 * The picture shown when a story's link is shared (WhatsApp, Facebook, X, Telegram...).
 *
 * The outlet's own picture is a poor share image: some are 600 KB PNGs (WhatsApp shows link-preview
 * pictures reliably only up to roughly 300 KB), some are WebP (not every link-preview crawler reads it),
 * and sizes vary. So each story is shared with a copy made here: exactly 1200 x 630 (the size Facebook,
 * X and WhatsApp recommend), always a JPEG, and kept under 240 KB.
 *
 * Safety: the address comes from our own database, but the feeds put it there, so it is only fetched from
 * the hosts we already allow for pictures (image-hosts.json), over https, and a redirect is followed only
 * to another allowed host. Size, time and pixel count are all capped.
 */

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 240 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const QUALITIES = [78, 68, 58, 48];

async function readCapped(response: Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_SOURCE_BYTES || !response.body) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_SOURCE_BYTES) return null;
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Downloads a picture from an allowed host (following redirects only to other allowed hosts), or null. */
export async function fetchAllowedImage(address: string): Promise<Buffer | null> {
  let current = address;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isOptimizableImage(current)) return null;
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "image/*", "user-agent": "Mozilla/5.0 (compatible; G12NewsImageFetcher/1.0)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) return null;
    return readCapped(response);
  }
  return null;
}

/** A 1200 x 630 JPEG under 240 KB made from a picture, or null if it is not a usable picture. */
export async function toShareJpeg(source: Buffer): Promise<Buffer | null> {
  try {
    const base = sharp(source, { limitInputPixels: 50_000_000, failOn: "error" }).rotate().resize(SHARE_WIDTH, SHARE_HEIGHT, { fit: "cover", position: "attention" });
    let best: Buffer | null = null;
    for (const quality of QUALITIES) {
      best = await base.clone().flatten({ background: "#ffffff" }).jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
      if (best.length <= MAX_OUTPUT_BYTES) break;
    }
    return best;
  } catch {
    return null;
  }
}

// Link-preview crawlers fetch each story once, but a story that is shared widely is fetched by many
// crawlers at nearly the same moment; a small in-memory cache (and sharing an in-flight job) means the
// picture is fetched and resized once, not once per crawler.
const CACHE_LIMIT = 64;
/**
 * A picture that could not be made is remembered only briefly: long enough that many crawlers hitting a dead
 * picture do not each make the outlet's server answer again, short enough that an outlet's temporary refusal
 * (a 403, 429 or 503) is not held against the story for the life of the process.
 */
const FAILURE_TTL_MS = 5 * 60_000;

interface Entry {
  jpeg: Buffer | null;
  /** When a failure stops being remembered (a success is kept until it is pushed out by newer ones). */
  expires: number;
}

/** Fetches and resizes a picture once per address (see above). Its parts are parameters only so tests can replace them. */
export function createShareImageCache({
  fetchImage = fetchAllowedImage,
  makeJpeg = toShareJpeg,
  now = Date.now,
}: { fetchImage?: (address: string) => Promise<Buffer | null>; makeJpeg?: (source: Buffer) => Promise<Buffer | null>; now?: () => number } = {}) {
  const cache = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<Buffer | null>>();

  return async function shareImageFor(address: string): Promise<Buffer | null> {
    const cached = cache.get(address);
    if (cached && (cached.jpeg || cached.expires > now())) return cached.jpeg;
    const running = inFlight.get(address);
    if (running) return running;

    const job = (async () => {
      try {
        const source = await fetchImage(address);
        const jpeg = source ? await makeJpeg(source) : null;
        cache.delete(address); // so a refreshed entry goes to the back of the line
        cache.set(address, { jpeg, expires: jpeg ? Infinity : now() + FAILURE_TTL_MS });
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
        return jpeg;
      } catch {
        return null; // a network error or timeout is not remembered at all: the next request tries again
      } finally {
        inFlight.delete(address);
      }
    })();
    inFlight.set(address, job);
    return job;
  };
}

export const shareImageFor = createShareImageCache();
