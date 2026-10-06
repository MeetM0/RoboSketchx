import { gaussianBlur } from './edges';
import { orderStrokes, simplify } from './geometry';
import { labelRegions } from './morphology';
import { traceEdges } from './trace';
import type { Polyline, RgbaImage, Sketch } from './types';

export type ScanOptions = {
  /** How much darker than its surroundings (0-1) a pixel must be to count as ink. */
  sensitivity: number;
};

export const DEFAULT_SCAN_OPTIONS: ScanOptions = { sensitivity: 0.15 };

export type PageScan = {
  /** Centre lines of the ink, cropped to the writing (pixel units). */
  sketch: Sketch;
  /** Share of the page (0-1) that is ink; ~0 means nothing legible was found. */
  inkFraction: number;
};

/**
 * Turns a photo of writing or line drawing on paper into pen strokes that follow the
 * *centre* of each inked line, so the robot re-writes it in the original hand (edge
 * detection would instead outline both sides of every pen stroke).
 *
 * 1. Ink vs paper with a local (adaptive) threshold, so shadows and uneven light across the
 *    page don't matter.
 * 2. Clean-up: drop specks, drop big blobs touching the photo edge (table, page edge,
 *    shadows), and fill pin-holes inside thick strokes.
 * 3. Zhang–Suen thinning to 1-pixel-wide centre lines, then trace and simplify them.
 */
export function scanPage(image: RgbaImage, options: ScanOptions = DEFAULT_SCAN_OPTIONS): PageScan {
  const { width, height } = image;
  let ink = threshold(image, options.sensitivity);
  ink = cleanInk(ink, width, height);

  let inkPixels = 0;
  for (let i = 0; i < ink.length; i++) inkPixels += ink[i];

  const skeleton = thin(ink, width, height);
  restoreDots(ink, skeleton, width, height);
  const strokes = traceEdges(skeleton, width, height)
    .filter((s) => s.length > 3 || isIsolated(s, skeleton, width, height))
    // A lone skeleton pixel is a dot (i, full stop): touch the pen down once.
    .map((s): Polyline => (s.length === 1 ? [s[0], s[0]] : simplify(s, 0.7)));

  return {
    // Thinning splits lines at every junction; rejoin pieces that touch to save pen lifts.
    sketch: cropToStrokes(joinTouchingStrokes(orderStrokes(strokes), 1.5), width, height),
    inkFraction: inkPixels / ink.length,
  };
}

/** Bradley-style adaptive threshold using an integral image of the blurred greyscale. */
function threshold({ data, width, height }: RgbaImage, sensitivity: number): Uint8Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  const smooth = gaussianBlur(gray, width, height, 0.8);

  // integral[(y+1)*(w+1) + (x+1)] = sum of smooth over [0..x] × [0..y]
  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += smooth[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }

  // Window ≈ 1/12 of the page: much bigger than a pen stroke, smaller than lighting changes.
  const half = Math.max(8, Math.round(Math.max(width, height) / 24));
  const ink = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * stride + x1 + 1] -
        integral[y0 * stride + x1 + 1] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const mean = sum / count;
      const value = smooth[y * width + x];
      // Relative darkness, plus an absolute minimum so paper grain on blank areas isn't ink.
      if (value < mean * (1 - sensitivity) && mean - value > 18) ink[y * width + x] = 1;
    }
  }
  return ink;
}

function cleanInk(ink: Uint8Array, width: number, height: number): Uint8Array {
  const size = width * height;
  const minSpeck = Math.max(4, Math.round((size / 1_000_000) * 12));

  const { labels, sizes, touchesBorder } = labelRegions(ink, width, height, 1);
  // Bounding boxes, to spot long page-edge / table-edge shadows touching the photo border.
  const minX = sizes.map(() => width);
  const maxX = sizes.map(() => 0);
  const minY = sizes.map(() => height);
  const maxY = sizes.map(() => 0);
  for (let i = 0; i < size; i++) {
    const label = labels[i];
    if (label === -1) continue;
    const x = i % width;
    const y = (i - x) / width;
    if (x < minX[label]) minX[label] = x;
    if (x > maxX[label]) maxX[label] = x;
    if (y < minY[label]) minY[label] = y;
    if (y > maxY[label]) maxY[label] = y;
  }
  const keep = sizes.map((count, label) => {
    if (count < minSpeck) return false;
    if (!touchesBorder[label]) return true;
    const spansFar =
      maxX[label] - minX[label] > width * 0.25 || maxY[label] - minY[label] > height * 0.25;
    return !(spansFar || count > size * 0.02);
  });

  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) if (labels[i] !== -1 && keep[labels[i]]) out[i] = 1;

  // Fill pin-holes left by uneven ink so they don't turn into little loops when thinned.
  const holes = labelRegions(out, width, height, 0);
  for (let i = 0; i < size; i++) {
    const label = holes.labels[i];
    if (label !== -1 && !holes.touchesBorder[label] && holes.sizes[label] <= minSpeck) out[i] = 1;
  }
  return out;
}

/** Zhang–Suen thinning: peels stroke borders until only a 1-pixel centre line remains. */
function thin(input: Uint8Array, width: number, height: number): Uint8Array {
  const img = input.slice();
  // Only pixels that are still set can change, so iterate over a shrinking candidate list.
  let candidates: number[] = [];
  for (let i = 0; i < img.length; i++) {
    if (!img[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    // The neighbourhood test needs all 8 neighbours, so drop ink on the outermost pixel ring.
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) img[i] = 0;
    else candidates.push(i);
  }

  const toClear: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      toClear.length = 0;
      for (const i of candidates) {
        if (!img[i]) continue;
        // Neighbours clockwise from north: p2..p9.
        const p2 = img[i - width];
        const p3 = img[i - width + 1];
        const p4 = img[i + 1];
        const p5 = img[i + width + 1];
        const p6 = img[i + width];
        const p7 = img[i + width - 1];
        const p8 = img[i - 1];
        const p9 = img[i - width - 1];
        const neighbours = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (neighbours < 2 || neighbours > 6) continue;
        const transitions =
          (!p2 && p3 ? 1 : 0) +
          (!p3 && p4 ? 1 : 0) +
          (!p4 && p5 ? 1 : 0) +
          (!p5 && p6 ? 1 : 0) +
          (!p6 && p7 ? 1 : 0) +
          (!p7 && p8 ? 1 : 0) +
          (!p8 && p9 ? 1 : 0) +
          (!p9 && p2 ? 1 : 0);
        if (transitions !== 1) continue;
        const clear =
          step === 0
            ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0
            : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
        if (clear) toClear.push(i);
      }
      for (const i of toClear) img[i] = 0;
      if (toClear.length) changed = true;
    }
    candidates = candidates.filter((i) => img[i]);
  }
  return img;
}

/**
 * True for a tiny traced fragment with no other skeleton pixels around it (a real dot).
 * Thinning leaves stray staircase pixels beside lines; those touch the line and are dropped.
 */
function isIsolated(stroke: Polyline, skeleton: Uint8Array, width: number, height: number) {
  const own = new Set(stroke.map((p) => p.y * width + p.x));
  for (const p of stroke) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx;
        const y = p.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        if (skeleton[i] && !own.has(i)) return false;
      }
    }
  }
  return true;
}

/**
 * Thinning can erase small solid blobs entirely (dots, filled eyes). Give every ink blob that
 * lost all of its skeleton a single dot at the ink pixel nearest its centre.
 */
function restoreDots(ink: Uint8Array, skeleton: Uint8Array, width: number, height: number) {
  const { labels, sizes } = labelRegions(ink, width, height, 1);
  const hasSkeleton = new Uint8Array(sizes.length);
  const sumX = new Float64Array(sizes.length);
  const sumY = new Float64Array(sizes.length);
  for (let i = 0; i < ink.length; i++) {
    const label = labels[i];
    if (label === -1) continue;
    if (skeleton[i]) hasSkeleton[label] = 1;
    const x = i % width;
    sumX[label] += x;
    sumY[label] += (i - x) / width;
  }
  const best = new Int32Array(sizes.length).fill(-1);
  const bestDistance = new Float64Array(sizes.length).fill(Infinity);
  for (let i = 0; i < ink.length; i++) {
    const label = labels[i];
    if (label === -1 || hasSkeleton[label]) continue;
    const x = i % width;
    const d = Math.hypot(x - sumX[label] / sizes[label], (i - x) / width - sumY[label] / sizes[label]);
    if (d < bestDistance[label]) {
      bestDistance[label] = d;
      best[label] = i;
    }
  }
  for (const i of best) if (i !== -1) skeleton[i] = 1;
}

/** Merges consecutive strokes when one ends where the next begins (within `maxGap` px). */
function joinTouchingStrokes(strokes: Polyline[], maxGap: number): Polyline[] {
  const out: Polyline[] = [];
  for (const stroke of strokes) {
    const previous = out[out.length - 1];
    if (previous) {
      const end = previous[previous.length - 1];
      if (Math.hypot(stroke[0].x - end.x, stroke[0].y - end.y) <= maxGap) {
        previous.push(...stroke.slice(1));
        continue;
      }
    }
    out.push(stroke.slice());
  }
  return out;
}

/** Crops the sketch to its strokes (plus a small border) so the writing fills the paper. */
function cropToStrokes(strokes: Polyline[], width: number, height: number): Sketch {
  if (!strokes.length) return { width, height, strokes };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const pad = 2;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  return {
    width: Math.min(width, maxX + pad) - x0,
    height: Math.min(height, maxY + pad) - y0,
    strokes: strokes.map((s) => s.map((p) => ({ x: p.x - x0, y: p.y - y0 }))),
  };
}
