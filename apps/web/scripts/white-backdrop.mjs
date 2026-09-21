// Puts the exact G12 News logo on a pure white backdrop, without touching the logo itself.
//
// The supplied artwork sits on a light-grey backdrop (#e4-#f2) with a soft drop shadow and a few pale
// glows. This finds the backdrop (the low-colour area connected to the image border, plus a short
// reach into the pale glows around the outline) and lifts only that area to white: each backdrop pixel
// is divided by the local backdrop brightness, so flat grey becomes white while the drop shadow stays
// a shadow, now on white. Pixels inside the logo are copied unchanged; only a 2 px anti-aliased fringe
// along its outline is blended.
import sharp from "sharp";

const SAT_BACKDROP = 10; // plain backdrop: almost no colour (max(r,g,b) - min(r,g,b) <= this)
const SAT_GLOW = 48; // pale glow: a little colour...
const LUM_GLOW_MIN = 190; // ...but still light
const GLOW_REACH = 36; // px a glow is followed from the backdrop (bounded, so it cannot run into the logo)
const UNSHADOWED_MIN = 226; // brightness above which a backdrop pixel counts as plain, unshadowed backdrop
const FEATHER = 2; // px of soft blend along the logo outline
const FIELD_STEP = 6; // the backdrop-brightness field is smooth, so it is computed at 1/6 size

/** Separable gaussian blur of a float image. */
function gauss(arr, W, H, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let j = -r; j <= r; j++) { k[j + r] = Math.exp(-(j * j) / (2 * sigma * sigma)); sum += k[j + r]; }
  for (let j = 0; j < k.length; j++) k[j] /= sum;
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let j = -r; j <= r; j++) { const xx = x + j; if (xx >= 0 && xx < W) s += arr[y * W + xx] * k[j + r]; }
    tmp[y * W + x] = s;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let j = -r; j <= r; j++) { const yy = y + j; if (yy >= 0 && yy < H) s += tmp[yy * W + x] * k[j + r]; }
    out[y * W + x] = s;
  }
  return out;
}

/** @param {string} src the master image @returns {Promise<{data: Buffer, width: number, height: number}>} RGB pixels on white */
export async function onWhite(src) {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const N = W * H;
  const px = (i, c) => data[i * 3 + c];
  const sat = (i) => Math.max(px(i, 0), px(i, 1), px(i, 2)) - Math.min(px(i, 0), px(i, 1), px(i, 2));
  const lum = (i) => (px(i, 0) + px(i, 1) + px(i, 2)) / 3;

  // 1. plain backdrop: low-colour pixels reachable from the border without crossing the logo
  const backdrop = new Uint8Array(N);
  const stack = [];
  const seed = (i) => { if (!backdrop[i] && sat(i) <= SAT_BACKDROP) { backdrop[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (i >= W) seed(i - W);
    if (i < N - W) seed(i + W);
  }

  // 2. pale glows: follow light, faintly coloured pixels outward from the backdrop, at most GLOW_REACH px
  const region = Uint8Array.from(backdrop);
  let frontier = [];
  for (let i = 0; i < N; i++) if (backdrop[i]) { const x = i % W; if ((x > 0 && !backdrop[i - 1]) || (x < W - 1 && !backdrop[i + 1]) || (i >= W && !backdrop[i - W]) || (i < N - W && !backdrop[i + W])) frontier.push(i); }
  for (let step = 0; step < GLOW_REACH && frontier.length; step++) {
    const next = [];
    const grow = (j) => { if (!region[j] && sat(j) <= SAT_GLOW && lum(j) >= LUM_GLOW_MIN) { region[j] = 1; next.push(j); } };
    for (const i of frontier) {
      const x = i % W;
      if (x > 0) grow(i - 1);
      if (x < W - 1) grow(i + 1);
      if (i >= W) grow(i - W);
      if (i < N - W) grow(i + W);
    }
    frontier = next;
  }

  // 3. local backdrop brightness B: a smooth field fitted (normalized convolution) to the plain, unshadowed backdrop
  const Wl = Math.ceil(W / FIELD_STEP), Hl = Math.ceil(H / FIELD_STEP);
  const denL = new Float32Array(Wl * Hl);
  const numL = [new Float32Array(Wl * Hl), new Float32Array(Wl * Hl), new Float32Array(Wl * Hl)];
  for (let i = 0; i < N; i++) {
    if (backdrop[i] && lum(i) >= UNSHADOWED_MIN) {
      const l = Math.floor(i / W / FIELD_STEP) * Wl + Math.floor((i % W) / FIELD_STEP);
      denL[l] += 1;
      for (let c = 0; c < 3; c++) numL[c][l] += px(i, c);
    }
  }
  const sigmaL = 90 / FIELD_STEP;
  const denB = gauss(denL, Wl, Hl, sigmaL);
  const numB = numL.map((n) => gauss(n, Wl, Hl, sigmaL));
  const field = (arr, x, y) => { // bilinear lookup of the low-res field at full-res (x, y)
    const fx = Math.min(Wl - 1, Math.max(0, x / FIELD_STEP - 0.5)), fy = Math.min(Hl - 1, Math.max(0, y / FIELD_STEP - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(Wl - 1, x0 + 1), y1 = Math.min(Hl - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    return (arr[y0 * Wl + x0] * (1 - tx) + arr[y0 * Wl + x1] * tx) * (1 - ty) + (arr[y1 * Wl + x0] * (1 - tx) + arr[y1 * Wl + x1] * tx) * ty;
  };

  // 4. soft weight: 1 on the backdrop/glow, fading to 0 over FEATHER px into the logo
  const w = gauss(Float32Array.from(region), W, H, FEATHER);

  // 5. output
  const out = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const wi = Math.min(1, w[i] * 1.6); // reach full weight just inside the edge
    if (wi <= 0.003) { out[i * 3] = px(i, 0); out[i * 3 + 1] = px(i, 1); out[i * 3 + 2] = px(i, 2); continue; }
    const x = i % W, y = (i - x) / W;
    const d = field(denB, x, y);
    for (let c = 0; c < 3; c++) {
      const p = px(i, c);
      const b = d > 1e-4 ? field(numB[c], x, y) / d : 238;
      const shade = Math.min(1, p / Math.max(b, 1));
      const t = Math.min(1, Math.max(0, (shade - 0.9) / (0.985 - 0.9)));
      const s = t * t * (3 - 2 * t); // smoothstep: plain backdrop -> pure white, real shadow kept
      const corrected = (shade + (1 - shade) * s) * 255;
      out[i * 3 + c] = Math.round(p + (corrected - p) * wi);
    }
  }
  return { data: out, width: W, height: H };
}

// run directly:  node scripts/white-backdrop.mjs <master.jpg> <out.png>
if (process.argv[1]?.endsWith("white-backdrop.mjs") && process.argv[2]) {
  const t0 = Date.now();
  const { data, width, height } = await onWhite(process.argv[2]);
  await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(process.argv[3]);
  console.log(`wrote ${process.argv[3]} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
