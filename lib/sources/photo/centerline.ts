import type { Point, Polyline, RgbaImage } from '../../geometry/types';
import { labelRegions } from './morphology';

// Line drawings (cartoons, inked sketches) are drawn with a pen *along* each dark line, so they
// are traced through the middle of the ink. Edge detection would find both sides of every line
// and draw each one twice.

/** Ink components smaller than this (pixels) are specks, not lines. */
const MIN_INK_PIXELS = 6;
/** Saturated colours count as ink only when this dark (keeps dark shading out of the lines). */
const SATURATED_INK_MAX_LUMA = 50;
/** Lines wider than this share of the image's longest side are areas, not lines. */
const MAX_LINE_WIDTH_FRACTION = 0.04;
/** max − min channel difference above which a colour counts as saturated. */
const SATURATED_CHROMA = 80;

/**
 * Pixels that are ink: clearly darker than the paper. The threshold follows the paper's
 * brightness (its 90th-percentile luminance), and saturated colours must be very dark, so
 * coloured fills and their shading are not mistaken for lines.
 */
export function inkMask({ data, width, height }: RgbaImage): Uint8Array {
  const n = width * height;
  const luma = new Uint8Array(n);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const l = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
    luma[i] = l;
    histogram[l]++;
  }
  let count = 0;
  let paper = 255;
  for (let l = 0; l < 256; l++) {
    count += histogram[l];
    if (count >= n * 0.9) {
      paper = l;
      break;
    }
  }
  const threshold = Math.min(85, Math.max(40, paper * 0.32));

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (luma[i] >= threshold) continue;
    const p = i * 4;
    const chroma =
      Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]);
    if (chroma > SATURATED_CHROMA && luma[i] >= SATURATED_INK_MAX_LUMA) continue;
    mask[i] = 1;
  }
  // Drop specks (JPEG noise, dust) and clear the 1-pixel border the thinning needs.
  const { labels, sizes } = labelRegions(mask, width, height, 1);
  for (let i = 0; i < n; i++) {
    if (mask[i] && sizes[labels[i]] < MIN_INK_PIXELS) mask[i] = 0;
  }
  for (let x = 0; x < width; x++) mask[x] = mask[(height - 1) * width + x] = 0;
  for (let y = 0; y < height; y++) mask[y * width] = mask[y * width + width - 1] = 0;
  return mask;
}

/**
 * Zhang–Suen thinning: peels pixels off the ink until every line is one pixel wide, keeping
 * its middle and its connections.
 */
export function thin(mask: Uint8Array, width: number, height: number): Uint8Array {
  const img = mask.slice();
  const remove: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      remove.length = 0;
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = y * width + x;
          if (!img[i]) continue;
          // Neighbours clockwise from north.
          const p2 = img[i - width];
          const p3 = img[i - width + 1];
          const p4 = img[i + 1];
          const p5 = img[i + width + 1];
          const p6 = img[i + width];
          const p7 = img[i + width - 1];
          const p8 = img[i - 1];
          const p9 = img[i - width - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            Number(!p2 && p3) +
            Number(!p3 && p4) +
            Number(!p4 && p5) +
            Number(!p5 && p6) +
            Number(!p6 && p7) +
            Number(!p7 && p8) +
            Number(!p8 && p9) +
            Number(!p9 && p2);
          if (a !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          remove.push(i);
        }
      }
      for (const i of remove) img[i] = 0;
      if (remove.length) changed = true;
    }
  }
  return img;
}

export type LineArtCheck = {
  isLineArt: boolean;
  /** Share of the image that is ink (0–1). */
  inkFraction: number;
  /** Average ink line width in pixels (ink area / centre-line length). */
  lineWidthPx: number;
  /** Ink mask and its one-pixel centre lines, reused for tracing. */
  ink: Uint8Array;
  skeleton: Uint8Array;
};

/**
 * Decides whether an image is a line drawing: enough ink, drawn as lines thin relative to the
 * image, not covering it in dark areas. Photos and shaded artwork fail this and keep using
 * edge tracing.
 */
export function checkLineArt(image: RgbaImage): LineArtCheck {
  const { width, height } = image;
  const ink = inkMask(image);
  const skeleton = thin(ink, width, height);
  let inkPixels = 0;
  let skeletonPixels = 0;
  for (let i = 0; i < ink.length; i++) {
    inkPixels += ink[i];
    skeletonPixels += skeleton[i];
  }
  const inkFraction = inkPixels / ink.length;
  const lineWidthPx = skeletonPixels ? inkPixels / skeletonPixels : 0;
  const isLineArt =
    skeletonPixels >= (width + height) / 2 &&
    inkFraction <= 0.3 &&
    lineWidthPx <= Math.max(3, MAX_LINE_WIDTH_FRACTION * Math.max(width, height));
  return { isLineArt, inkFraction, lineWidthPx, ink, skeleton };
}

/**
 * Traced centre-line chains stop one pixel short of the line they join (that pixel belongs to
 * the other chain). Extends each chain end onto a touching centre-line pixel that isn't part of
 * its own last few points, so T-junctions are drawn closed instead of with a 0.5 mm gap.
 */
export function closeJunctions(
  chains: Polyline[],
  skeleton: Uint8Array,
  width: number,
  height: number
): Polyline[] {
  const extend = (chain: Polyline, atEnd: boolean): Polyline => {
    const tip = atEnd ? chain[chain.length - 1] : chain[0];
    const own = (atEnd ? chain.slice(-4) : chain.slice(0, 4)).map((p) => `${p.x},${p.y}`);
    let best: Point | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tip.x + dx;
        const y = tip.y + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= width || y >= height) continue;
        if (!skeleton[y * width + x] || own.includes(`${x},${y}`)) continue;
        // Prefer an orthogonal neighbour (closer) over a diagonal one.
        if (
          !best ||
          Math.abs(dx) + Math.abs(dy) < Math.abs(best.x - tip.x) + Math.abs(best.y - tip.y)
        ) {
          best = { x, y };
        }
      }
    }
    if (!best) return chain;
    return atEnd ? [...chain, best] : [best, ...chain];
  };
  return chains.map((chain) => (chain.length < 2 ? chain : extend(extend(chain, true), false)));
}
