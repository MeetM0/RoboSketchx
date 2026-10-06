import { gaussianBlur } from './edges';
import { dilate, erode, labelRegions } from './morphology';
import type { RgbaImage } from './types';

export type BackgroundRemoval =
  | {
      ok: true;
      /** 1 = subject, 0 = background; width * height of the source image. */
      mask: Uint8Array;
      /** Share of the image (0-1) kept as subject. */
      subjectFraction: number;
    }
  | {
      ok: false;
      reason: 'busy-background' | 'no-background' | 'no-subject';
    };

/** Colour clusters learned from the border; at most this many background colours. */
const MAX_BACKGROUND_COLOURS = 4;
/** Blur (pixels) applied before comparing colours, so sensor noise doesn't break the fill. */
const COLOUR_BLUR_SIGMA = 1.5;
/** Max colour step (ΔE) between neighbours for the fill to follow a lighting gradient. */
const GRADIENT_STEP = 4;
/** How far past a background colour's tolerance a gradient may lead the fill. */
const GRADIENT_REACH = 1.6;
/** Average colour spread (ΔE) of the border above which the background is too busy. */
const BUSY_SPREAD = 8;
/** Results outside this subject-size range mean the separation failed. */
const MIN_SUBJECT_FRACTION = 0.02;
const MAX_SUBJECT_FRACTION = 0.97;

/**
 * Separates the main subject from a plain-ish background without ML:
 *
 * 1. Learn the background's colours from the photo border (the subject is usually framed
 *    away from at least most of the edges).
 * 2. Flood-fill inward from the border through pixels close to those colours, also following
 *    gentle lighting gradients.
 * 3. Clean the mask: remove specks, close gaps, keep the main subject blob(s), and fill holes
 *    inside the subject unless they clearly show the background.
 *
 * Works best on plain or softly textured backgrounds (walls, tables, sky, paper). Busy scenes
 * where the background shares colours with the subject will fail or leak; `ok: false` is
 * returned when the result is implausible so callers can fall back to the full photo.
 */
export function removeBackground(image: RgbaImage): BackgroundRemoval {
  const { width, height } = image;
  const size = width * height;
  const lab = toBlurredLab(image);

  const border = borderPixels(width, height);
  const clusters = clusterColours(lab, border, MAX_BACKGROUND_COLOURS);
  const background = pickBackgroundClusters(clusters, border, width, height);
  if (background.length === 0) return { ok: false, reason: 'no-background' };
  let spread = 0;
  let samples = 0;
  for (const c of background) {
    spread += c.spread * c.members.length;
    samples += c.members.length;
  }
  if (spread / samples > BUSY_SPREAD) return { ok: false, reason: 'busy-background' };

  // Distance from every pixel to its nearest background colour, scaled by that colour's
  // tolerance; < 1 means "looks like background".
  const bgScore = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let best = Infinity;
    for (const c of background) {
      const d = labDistance(lab, i, c.centre) / c.tolerance;
      if (d < best) best = d;
    }
    bgScore[i] = best;
  }

  const isBackground = floodFromBorder(lab, bgScore, border, width, height);

  let mask: Uint8Array = new Uint8Array(size);
  for (let i = 0; i < size; i++) mask[i] = isBackground[i] ? 0 : 1;

  const radius = Math.max(1, Math.round(Math.min(width, height) / 300));
  mask = dilate(erode(mask, width, height, radius), width, height, radius); // open: drop specks
  mask = erode(dilate(mask, width, height, radius), width, height, radius); // close: seal gaps
  mask = keepMainSubject(mask, width, height);
  fillHoles(mask, bgScore, width, height);

  let subjectPixels = 0;
  for (let i = 0; i < size; i++) subjectPixels += mask[i];
  const subjectFraction = subjectPixels / size;
  if (subjectFraction < MIN_SUBJECT_FRACTION) return { ok: false, reason: 'no-subject' };
  if (subjectFraction > MAX_SUBJECT_FRACTION) return { ok: false, reason: 'no-background' };
  return { ok: true, mask, subjectFraction };
}

/** Composites the subject onto white paper, with a softened mask edge to avoid jaggies. */
export function applyMask(image: RgbaImage, mask: Uint8Array): RgbaImage {
  const { width, height, data } = image;
  const alpha = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) alpha[i] = mask[i];
  const soft = gaussianBlur(alpha, width, height, 1);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < mask.length; i++) {
    const a = soft[i];
    const p = i * 4;
    out[p] = data[p] * a + 255 * (1 - a);
    out[p + 1] = data[p + 1] * a + 255 * (1 - a);
    out[p + 2] = data[p + 2] * a + 255 * (1 - a);
    out[p + 3] = 255;
  }
  return { width, height, data: out };
}

// --- Colour -----------------------------------------------------------------------------

type Lab = { l: Float32Array; a: Float32Array; b: Float32Array };
type Colour = [number, number, number];

/** CIE L*a*b*, where Euclidean distance roughly matches perceived colour difference (ΔE). */
function toBlurredLab({ data, width, height }: RgbaImage): Lab {
  const size = width * height;
  const l = new Float32Array(size);
  const a = new Float32Array(size);
  const b = new Float32Array(size);
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  for (let i = 0; i < size; i++) {
    const p = i * 4;
    const r = linear(data[p]);
    const g = linear(data[p + 1]);
    const bl = linear(data[p + 2]);
    // sRGB → XYZ (D65), normalised by the white point.
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047);
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * bl);
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
    l[i] = 116 * y - 16;
    a[i] = 500 * (x - y);
    b[i] = 200 * (y - z);
  }
  return {
    l: gaussianBlur(l, width, height, COLOUR_BLUR_SIGMA),
    a: gaussianBlur(a, width, height, COLOUR_BLUR_SIGMA),
    b: gaussianBlur(b, width, height, COLOUR_BLUR_SIGMA),
  };
}

function labDistance(lab: Lab, i: number, c: Colour) {
  return Math.hypot(lab.l[i] - c[0], lab.a[i] - c[1], lab.b[i] - c[2]);
}

function pixelDistance(lab: Lab, i: number, j: number) {
  return Math.hypot(lab.l[i] - lab.l[j], lab.a[i] - lab.a[j], lab.b[i] - lab.b[j]);
}

// --- Background model --------------------------------------------------------------------

type Cluster = { centre: Colour; members: number[]; spread: number; tolerance: number };

/** Width in pixels of the border strip used to learn the background. */
function stripWidth(width: number, height: number) {
  return Math.max(2, Math.round(Math.min(width, height) * 0.02));
}

/** Pixel indices in a thin strip around the image edge. */
function borderPixels(width: number, height: number): number[] {
  const strip = stripWidth(width, height);
  const out: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < strip || y < strip || x >= width - strip || y >= height - strip) {
        out.push(y * width + x);
      }
    }
  }
  return out;
}

/** k-means over the border pixels, seeded deterministically with farthest-point picks. */
function clusterColours(lab: Lab, pixels: number[], k: number): Cluster[] {
  const colourOf = (i: number): Colour => [lab.l[i], lab.a[i], lab.b[i]];
  const centres: Colour[] = [colourOf(pixels[0])];
  while (centres.length < k) {
    let farthest = -1;
    let farthestDistance = 0;
    for (const i of pixels) {
      let nearest = Infinity;
      for (const c of centres) nearest = Math.min(nearest, labDistance(lab, i, c));
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthest = i;
      }
    }
    // Don't split colours that are already near-identical.
    if (farthest === -1 || farthestDistance < 8) break;
    centres.push(colourOf(farthest));
  }

  let members: number[][] = [];
  for (let iteration = 0; iteration < 8; iteration++) {
    members = centres.map(() => []);
    for (const i of pixels) {
      let best = 0;
      let bestDistance = Infinity;
      centres.forEach((c, ci) => {
        const d = labDistance(lab, i, c);
        if (d < bestDistance) {
          bestDistance = d;
          best = ci;
        }
      });
      members[best].push(i);
    }
    centres.forEach((c, ci) => {
      const m = members[ci];
      if (!m.length) return;
      let l = 0;
      let a = 0;
      let b = 0;
      for (const i of m) {
        l += lab.l[i];
        a += lab.a[i];
        b += lab.b[i];
      }
      centres[ci] = [l / m.length, a / m.length, b / m.length];
    });
  }

  return centres
    .map((centre, ci) => {
      const m = members[ci];
      let spread = 0;
      for (const i of m) spread += labDistance(lab, i, centre);
      spread = m.length ? spread / m.length : 0;
      // Noisier / more textured backgrounds get a wider tolerance.
      const tolerance = Math.min(30, Math.max(10, 2.5 * spread + 6));
      return { centre, members: m, spread, tolerance };
    })
    .filter((c) => c.members.length > 0);
}

/**
 * A border colour counts as background if it runs along at least two sides of the photo or
 * covers a large share of the border. A subject touching one edge (e.g. a person's shoulders
 * at the bottom) therefore isn't mistaken for background.
 */
function pickBackgroundClusters(
  clusters: Cluster[],
  border: number[],
  width: number,
  height: number
): Cluster[] {
  return clusters.filter((cluster) => {
    const sides = [0, 0, 0, 0]; // top, bottom, left, right
    for (const i of cluster.members) {
      const x = i % width;
      const y = (i - x) / width;
      const distances = [y, height - 1 - y, x, width - 1 - x];
      sides[distances.indexOf(Math.min(...distances))]++;
    }
    const strip = stripWidth(width, height);
    const sidePixels = [width * strip, width * strip, height * strip, height * strip];
    const sidesCovered = sides.filter((n, side) => n / sidePixels[side] >= 0.15).length;
    return sidesCovered >= 2 || cluster.members.length / border.length >= 0.35;
  });
}

// --- Fill ------------------------------------------------------------------------------

function floodFromBorder(
  lab: Lab,
  bgScore: Float32Array,
  border: number[],
  width: number,
  height: number
): Uint8Array {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const i of border) {
    if (bgScore[i] < 1 && !visited[i]) {
      visited[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    const neighbours = [
      x > 0 ? i - 1 : -1,
      x < width - 1 ? i + 1 : -1,
      i >= width ? i - width : -1,
      i < width * (height - 1) ? i + width : -1,
    ];
    for (const n of neighbours) {
      if (n < 0 || visited[n]) continue;
      // Join if the colour matches the background model, or if it continues a smooth
      // gradient (shadows, vignetting) without straying too far from the model.
      const matches =
        bgScore[n] < 1 || (bgScore[n] < GRADIENT_REACH && pixelDistance(lab, i, n) < GRADIENT_STEP);
      if (matches) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  return visited;
}

// --- Mask clean-up -----------------------------------------------------------------------

/** Keeps the largest subject region plus any others at least 20% of its size. */
function keepMainSubject(mask: Uint8Array, width: number, height: number): Uint8Array {
  const { labels, sizes } = labelRegions(mask, width, height, 1);
  if (!sizes.length) return mask;
  const largest = Math.max(...sizes);
  const minSize = Math.max(largest * 0.2, mask.length * 0.005);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (labels[i] !== -1 && sizes[labels[i]] >= minSize) out[i] = 1;
  }
  return out;
}

/**
 * Background pockets enclosed by the subject: small ones are filled in (they're usually
 * shading inside the subject), but larger ones that clearly match the background colour
 * (e.g. the gap between an arm and a body) stay as background.
 */
function fillHoles(mask: Uint8Array, bgScore: Float32Array, width: number, height: number) {
  const { labels, sizes, touchesBorder } = labelRegions(mask, width, height, 0);
  const scoreSum = new Float64Array(sizes.length);
  for (let i = 0; i < mask.length; i++) if (labels[i] !== -1) scoreSum[labels[i]] += bgScore[i];
  const keepAsBackground = sizes.map(
    (size, label) =>
      touchesBorder[label] || (size >= mask.length * 0.003 && scoreSum[label] / size < 0.7)
  );
  for (let i = 0; i < mask.length; i++) {
    if (labels[i] !== -1 && !keepAsBackground[labels[i]]) mask[i] = 1;
  }
}

/** SVG path covering the background (mask === 0) as one rectangle per horizontal run. */
export function backgroundPathData(mask: Uint8Array, width: number, height: number): string {
  const parts: string[] = [];
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      if (mask[y * width + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < width && !mask[y * width + x]) x++;
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  }
  return parts.join('');
}
