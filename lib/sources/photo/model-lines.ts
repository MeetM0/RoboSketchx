import { inkDistance, thin } from './centerline';

// A learned line-drawing model ("Learning to generate line drawings that convey geometry and
// semantics", Chan, Durand & Isola, CVPR 2022, MIT) draws the lines a person would, including
// ones the rules in centerline.ts can't see: a black glove on a black outline, navy eyebrows on
// a black mask, the shape of a black emblem. Its strokes are soft and pencil-like, so they are
// used only to add what the rule-based pen paths miss, never to replace them.

/** Greyscale line image from the model: 0 = ink, 1 = paper, row-major. */
export type ModelLines = { grey: Float32Array; width: number; height: number };

/** Model output below this (after a light blur) is a line. */
const MODEL_LINE_LEVEL = 0.8;
/** Model lines within this many pixels (plus half the drawing's line half-width) of a pen path are already drawn. */
const MODEL_LINE_CLEARANCE = 2;
const MODEL_LINE_CLEARANCE_SHARE = 0.5;
/**
 * Model lines closer than this (pixels, plus the line half-width) to the edge of black ink follow
 * that edge: only black fills, deeper than any ordinary line, can hold lines the rules miss.
 */
const MODEL_LINE_INK_EDGE = 3;
/** A new model line is at least this share of the picture's longest side long. */
const MODEL_LINE_MIN_SHARE = 0.03;

/** Bilinear resize of a single-channel image. */
function resizeGrey(src: ModelLines, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  const kx = src.width / width;
  const ky = src.height / height;
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.max(0, (y + 0.5) * ky - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.max(0, (x + 0.5) * kx - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const tx = sx - x0;
      const g = src.grey;
      const top = g[y0 * src.width + x0] * (1 - tx) + g[y0 * src.width + x1] * tx;
      const bottom = g[y1 * src.width + x0] * (1 - tx) + g[y1 * src.width + x1] * tx;
      out[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

/** Separable box blur of radius r, applied twice (close to a Gaussian). */
function blur(g: Float32Array, width: number, height: number, r: number): Float32Array {
  let cur = g;
  for (let pass = 0; pass < 2; pass++) {
    const h = new Float32Array(cur.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let s = 0;
        let n = 0;
        for (let k = Math.max(0, x - r); k <= Math.min(width - 1, x + r); k++) {
          s += cur[y * width + k];
          n++;
        }
        h[y * width + x] = s / n;
      }
    }
    const v = new Float32Array(cur.length);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let s = 0;
        let n = 0;
        for (let k = Math.max(0, y - r); k <= Math.min(height - 1, y + r); k++) {
          s += h[k * width + x];
          n++;
        }
        v[y * width + x] = s / n;
      }
    }
    cur = v;
  }
  return cur;
}

/**
 * Pen paths plus the model's lines that aren't drawn yet: model line centres farther than the
 * clearance from every pen path, in pieces long enough to be lines, each extended back along
 * the model line until it reaches the existing drawing so it joins it.
 */
export function addModelLines(
  paths: Uint8Array,
  ink: Uint8Array,
  model: ModelLines,
  width: number,
  height: number,
  lineHalf: number
): Uint8Array {
  const n = width * height;
  // Blur at the model's own resolution (merges its pencil strands into one stroke), then scale.
  const r = Math.max(1, Math.round(model.width / 512));
  const soft = blur(model.grey, model.width, model.height, r);
  const grey = resizeGrey({ grey: soft, width: model.width, height: model.height }, width, height);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = grey[i] < MODEL_LINE_LEVEL ? 1 : 0;
  for (let x = 0; x < width; x++) mask[x] = mask[(height - 1) * width + x] = 0;
  for (let y = 0; y < height; y++) mask[y * width] = mask[y * width + width - 1] = 0;
  const centre = thin(mask, width, height);

  const notPath = new Uint8Array(n);
  for (let i = 0; i < n; i++) notPath[i] = paths[i] ? 0 : 1;
  const toPath = inkDistance(notPath, width, height, false);
  const clearance = MODEL_LINE_CLEARANCE + MODEL_LINE_CLEARANCE_SHARE * lineHalf;
  // The model draws both edges of a thick black line, or around a black shape; those are
  // already drawn (its centre line, or its outline).
  const inside = inkDistance(ink, width, height);
  // Only inside black areas: that is where the rules are blind (a glove on a black arm,
  // eyebrows on a black mask, folds in a black cape). Outside ink the rules already draw the
  // drawing's lines and colour boundaries, and the model's soft lines there only duplicate them.
  const isNew = (i: number) =>
    toPath[i] > clearance && ink[i] === 1 && inside[i] > MODEL_LINE_INK_EDGE + lineHalf;

  // Pieces of model line away from the drawing, by 8-connected component.
  const label = new Int32Array(n).fill(-1);
  const pieces: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (!centre[start] || !isNew(start) || label[start] >= 0) continue;
    const piece = [start];
    label[start] = pieces.length;
    for (let k = 0; k < piece.length; k++) {
      const i = piece[k];
      const x = i % width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * width + dx;
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || j < 0 || j >= n) continue;
          if (!centre[j] || label[j] >= 0 || !isNew(j)) continue;
          label[j] = pieces.length;
          piece.push(j);
        }
      }
    }
    pieces.push(piece);
  }

  const out = paths.slice();
  const minLength = MODEL_LINE_MIN_SHARE * Math.max(width, height);
  const added = new Uint8Array(n);
  for (const piece of pieces) {
    if (piece.length < minLength) continue;
    for (const i of piece) out[i] = added[i] = 1;
  }
  // Bridges: from each added piece, follow the model line into the clearance zone until it
  // touches a pen path (at most the clearance plus a little), so the new line joins the drawing.
  const reach = Math.ceil(clearance) + 3;
  let frontier: number[] = [];
  for (let i = 0; i < n; i++) if (added[i]) frontier.push(i);
  const seen = added.slice();
  for (let step = 0; step < reach && frontier.length; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * width + dx;
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || j < 0 || j >= n) continue;
          if (!centre[j] || seen[j] || !ink[j]) continue;
          seen[j] = 1;
          out[j] = 1;
          if (!paths[j]) next.push(j);
        }
      }
    }
    frontier = next;
  }
  return out;
}
