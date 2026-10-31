import type { Point, Polyline, RgbaImage } from '../../geometry/types';
import { labelRegions } from './morphology';

// Line drawings (cartoons, inked sketches) are drawn with a pen *along* each dark line, so they
// are traced through the middle of the ink. Edge detection would find both sides of every line
// and draw each one twice.

/** Ink components smaller than this (pixels) are specks, not lines. */
const MIN_INK_PIXELS = 6;
/** Holes in the ink up to this share of the image's longest side across are filled. */
const PINHOLE_SIZE = 0.006;
/** Saturated colours count as ink only when this dark (keeps dark shading out of the lines). */
const SATURATED_INK_MAX_LUMA = 50;
/** Lines wider than this share of the image's longest side are areas, not lines. */
const MAX_LINE_WIDTH_FRACTION = 0.04;
/** Dark pixels this colourful (max − min channels, and that share of the brightest) are fills. */
const DARK_FILL_CHROMA = 40;
const DARK_FILL_SATURATION = 0.5;
/** Radius (pixels) of the blur the fill colour is judged on. */
const FILL_COLOUR_RADIUS = 2;
/** max − min channel difference above which a colour counts as saturated. */
const SATURATED_CHROMA = 80;

/**
 * Which pixels count as ink:
 * - `dark`: clearly darker than the paper, with saturated colours only when very dark, so the
 *   coloured fills and shading of a cartoon stay out of its black lines;
 * - `contrast`: anything that clearly stands out from the paper around it, coloured ink and
 *   faint pencil included, judged against the local paper so uneven light in a photo of a
 *   drawing doesn't count. Used when a drawing has no dark lines.
 */
export type InkKind = 'dark' | 'contrast';

export function inkMask(image: RgbaImage, kind: InkKind = 'dark'): Uint8Array {
  const { data, width, height } = image;
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

  const mask = new Uint8Array(n);
  if (kind === 'dark') {
    const threshold = Math.min(85, Math.max(40, paper * 0.32));
    // Colour judged on a lightly blurred copy: JPEG stores colour at half resolution in blocks,
    // so per-pixel colour makes the edge of a coloured fill ragged.
    const mean = boxMean(data, width, height, FILL_COLOUR_RADIUS);
    for (let i = 0; i < n; i++) {
      if (luma[i] >= threshold) continue;
      const p = i * 4;
      const chroma =
        Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]);
      if (chroma > SATURATED_CHROMA && luma[i] >= SATURATED_INK_MAX_LUMA) continue;
      // A dark but clearly coloured fill (navy, maroon), not a black line.
      const r = mean[i * 3];
      const g = mean[i * 3 + 1];
      const b = mean[i * 3 + 2];
      const max = Math.max(r, g, b);
      const meanChroma = max - Math.min(r, g, b);
      // The pixel itself must be coloured too, or a thin black line on a red fill would go.
      const isFill =
        chroma >= DARK_FILL_CHROMA / 2 &&
        meanChroma >= DARK_FILL_CHROMA &&
        meanChroma >= DARK_FILL_SATURATION * max;
      if (isFill) continue;
      mask[i] = 1;
    }
  } else {
    const local = localPaper(
      luma,
      width,
      height,
      Math.max(6, Math.round(0.03 * Math.max(width, height)))
    );
    // The paper's colour: the average of its brightest tenth.
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let pn = 0;
    for (let i = 0; i < n; i++) {
      if (luma[i] < paper) continue;
      pr += data[i * 4];
      pg += data[i * 4 + 1];
      pb += data[i * 4 + 2];
      pn++;
    }
    pr /= pn || 1;
    pg /= pn || 1;
    pb /= pn || 1;
    for (let i = 0; i < n; i++) {
      const darker = local[i] - luma[i];
      const p = i * 4;
      const colour = Math.hypot(data[p] - pr, data[p + 1] - pg, data[p + 2] - pb);
      if (darker >= Math.max(CONTRAST_INK_MIN_STEP, CONTRAST_INK_FRACTION * local[i])) mask[i] = 1;
      else if (colour >= COLOUR_INK_DISTANCE && darker >= COLOUR_INK_MIN_STEP) mask[i] = 1;
    }
  }
  // Drop specks (JPEG noise, dust) and clear the 1-pixel border the thinning needs.
  const { labels, sizes } = labelRegions(mask, width, height, 1);
  for (let i = 0; i < n; i++) {
    if (mask[i] && sizes[labels[i]] < MIN_INK_PIXELS) mask[i] = 0;
  }
  // Fill pinholes in the ink (texture or glare in a black area), which would each be drawn
  // as a tiny loop.
  const paperMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) paperMask[i] = mask[i] ? 0 : 1;
  const holes = labelRegions(paperMask, width, height, 1);
  const maxHole = Math.max(4, (PINHOLE_SIZE * Math.max(width, height)) ** 2);
  for (let i = 0; i < n; i++) {
    const l = holes.labels[i];
    if (paperMask[i] && !holes.touchesBorder[l] && holes.sizes[l] <= maxHole) mask[i] = 1;
  }
  for (let x = 0; x < width; x++) mask[x] = mask[(height - 1) * width + x] = 0;
  for (let y = 0; y < height; y++) mask[y * width] = mask[y * width + width - 1] = 0;
  return mask;
}

/** Per-pixel mean RGB over a (2r+1)² box, from summed-area tables. */
function boxMean(data: Uint8Array, width: number, height: number, r: number): Float32Array {
  const w1 = width + 1;
  const sums = [0, 1, 2].map(() => new Float64Array(w1 * (height + 1)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const o = (y + 1) * w1 + x + 1;
      for (let c = 0; c < 3; c++) {
        sums[c][o] = data[p + c] + sums[c][o - 1] + sums[c][o - w1] - sums[c][o - w1 - 1];
      }
    }
  }
  const out = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height, y + r + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const area = (x1 - x0) * (y1 - y0);
      for (let c = 0; c < 3; c++) {
        const t = sums[c];
        out[(y * width + x) * 3 + c] =
          (t[y1 * w1 + x1] - t[y0 * w1 + x1] - t[y1 * w1 + x0] + t[y0 * w1 + x0]) / area;
      }
    }
  }
  return out;
}

/**
 * Contrast ink judges against the paper within `paperRadius`, so inside a large dark area only
 * a band about that wide near its edge stands out: a photo can look like thick lines. Real
 * drawn lines are well under the window; these limits keep such photos out.
 */
const CONTRAST_MAX_WIDTH_SHARE = 0.5;
const CONTRAST_MAX_INK_FRACTION = 0.15;
const paperRadius = (width: number, height: number) =>
  Math.max(6, Math.round(0.03 * Math.max(width, height)));

/** Contrast ink: at least this much darker than the local paper (grey levels)... */
const CONTRAST_INK_MIN_STEP = 25;
/** ...and at least this share of the local paper's brightness. */
const CONTRAST_INK_FRACTION = 0.28;
/** Or this far from the paper's colour (RGB distance), e.g. a yellow crayon on white. */
const COLOUR_INK_DISTANCE = 100;
const COLOUR_INK_MIN_STEP = 15;

/**
 * The paper's brightness around each pixel: the brightest (lightly smoothed) value within
 * `radius`, which ink lines narrower than the window don't affect but shadows and lighting
 * gradients do.
 */
function localPaper(luma: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  // 3x3 box blur first, so single bright noise pixels don't set the paper level.
  const smooth = new Uint8Array(luma.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          sum += luma[ny * width + nx];
          k++;
        }
      }
      smooth[y * width + x] = sum / k;
    }
  }
  const rows = new Uint8Array(luma.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let k = Math.max(0, x - radius); k <= Math.min(width - 1, x + radius); k++) {
        m = Math.max(m, smooth[y * width + k]);
      }
      rows[y * width + x] = m;
    }
  }
  const out = new Uint8Array(luma.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0;
      for (let k = Math.max(0, y - radius); k <= Math.min(height - 1, y + radius); k++) {
        m = Math.max(m, rows[k * width + x]);
      }
      out[y * width + x] = m;
    }
  }
  return out;
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
  /** Which ink definition found the drawing. */
  ink: InkKind;
  /** Share of the image that is ink (0–1). */
  inkFraction: number;
  /** Average ink line width in pixels (ink area / centre-line length). */
  lineWidthPx: number;
  /** Ink mask and its one-pixel centre lines. */
  inkMask: Uint8Array;
  skeleton: Uint8Array;
  /** What the pen should follow: centre lines of lines, outlines of solid shapes. */
  paths: Uint8Array;
};

/**
 * Decides whether an image is a line drawing: enough ink, drawn as lines thin relative to the
 * image, not covering it in dark areas. Photos and shaded artwork fail this and keep using
 * edge tracing.
 */
export function checkLineArt(image: RgbaImage): LineArtCheck {
  // Dark ink first (black-lined drawings, coloured or not); then any clearly visible ink, for
  // drawings in coloured marker, crayon or pencil.
  const dark = measureLineArt(image, 'dark');
  if (dark.isLineArt) return dark;
  const contrast = measureLineArt(image, 'contrast');
  return contrast.isLineArt ? contrast : dark;
}

/**
 * Line-drawing measures for one ink definition. `force` computes the pen paths even when the
 * image doesn't pass as a line drawing (the person chose "Line drawing").
 */
export function measureLineArt(image: RgbaImage, kind: InkKind, force = false): LineArtCheck {
  const { width, height } = image;
  const ink = inkMask(image, kind);
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
    inkFraction <= (kind === 'dark' ? 0.3 : CONTRAST_MAX_INK_FRACTION) &&
    lineWidthPx <= Math.max(3, MAX_LINE_WIDTH_FRACTION * Math.max(width, height)) &&
    (kind === 'dark' || lineWidthPx <= CONTRAST_MAX_WIDTH_SHARE * paperRadius(width, height));
  const paths = isLineArt || force ? penPaths(ink, skeleton, width, height) : skeleton;
  return { isLineArt, ink: kind, inkFraction, lineWidthPx, inkMask: ink, skeleton, paths };
}

/** Thickness factor over the typical line's half-width at which ink counts as a solid shape. */
const SOLID_THICKNESS = 1.8;
/** A solid shape's thick core is at most this many peak half-widths long (else a bold line). */
const SOLID_MAX_LENGTH = 6;
/** Ink at least this many typical line half-widths thick is drawn by its outline, whatever its length. */
const BAND_THICKNESS = 3;
/** ...and at least this thick (pixels), so drawings with hairlines don't outline ordinary lines. */
const BAND_MIN_HALF_WIDTH = 4;
/** How far (pixels) solid shapes are grown over adjoining ink to reach their own edge. */
const SOLID_GROW_PX = 2;

/**
 * Chamfer (3-4) distance from each ink pixel to the nearest paper pixel, in pixels: half the
 * local line width at a line's centre.
 */
export function inkDistance(
  ink: Uint8Array,
  width: number,
  height: number,
  edgeIsPaper = true
): Float32Array {
  const d = new Float32Array(ink.length);
  const far = 1e9;
  for (let i = 0; i < ink.length; i++) d[i] = ink[i] ? far : 0;
  const outside = edgeIsPaper ? 0 : far;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? outside : d[y * width + x];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(
        d[i],
        at(x - 1, y) + 3,
        at(x, y - 1) + 3,
        at(x - 1, y - 1) + 4,
        at(x + 1, y - 1) + 4
      );
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!d[i]) continue;
      d[i] = Math.min(
        d[i],
        at(x + 1, y) + 3,
        at(x, y + 1) + 3,
        at(x + 1, y + 1) + 4,
        at(x - 1, y + 1) + 4
      );
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/**
 * The drawing's typical line half-width: the most common centre-line thickness (in half-pixel
 * bins, smoothed over neighbours). Not the median: in a cartoon with large black fills most of
 * the centre line runs through the fills, which would make the fills the "typical line".
 */
function typicalHalfWidth(skeleton: Uint8Array, dist: Float32Array): number {
  const bins: number[] = [];
  for (let i = 0; i < skeleton.length; i++) {
    if (!skeleton[i]) continue;
    const b = Math.round(dist[i] * 2);
    bins[b] = (bins[b] ?? 0) + 1;
  }
  let best = 2;
  let bestCount = -1;
  for (let b = 0; b < bins.length; b++) {
    const count = (bins[b - 1] ?? 0) + (bins[b] ?? 0) + (bins[b + 1] ?? 0);
    if (count > bestCount) {
      bestCount = count;
      best = b;
    }
  }
  return Math.max(1, best / 2);
}

/**
 * The pixels the pen follows. Lines (long relative to their width, however bold) keep their
 * centre line. Solid shapes (eyes, noses, a filled ear or mouth: thick everywhere and short
 * for their thickness) are drawn by their outline instead, since a centre line through a dot
 * is a meaningless dash and through a large patch a web of cells. Shapes are found from the
 * ink's thickness, not the centre line: thinning can erase a small round blob entirely.
 */
export function penPaths(
  ink: Uint8Array,
  skeleton: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const dist = inkDistance(ink, width, height);
  const lineHalf = typicalHalfWidth(skeleton, dist);
  const thick = Math.max(2.5, SOLID_THICKNESS * lineHalf);

  const paths = skeleton.slice();
  const solid = new Uint8Array(ink.length);
  const seen = new Uint8Array(ink.length);
  const component = (start: number, accept: (i: number) => boolean) => {
    const out = [start];
    seen[start] = 1;
    for (let k = 0; k < out.length; k++) {
      const i = out[k];
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (!seen[n] && accept(n)) {
            seen[n] = 1;
            out.push(n);
          }
        }
      }
    }
    return out;
  };

  for (let start = 0; start < ink.length; start++) {
    if (seen[start] || dist[start] < thick) continue;
    // The thick seed, then everything joined to it that stays at least 60 % as thick as its
    // peak. A bold line runs on for many widths at that thickness; a solid shape soon ends.
    const seed = component(start, (n) => dist[n] >= thick);
    let peak = 0;
    for (const i of seed) peak = Math.max(peak, dist[i]);
    const core = [...seed, ...component(seed[0], (n) => dist[n] >= 0.6 * peak)];
    // Area of a strip 0.8 x peak wide, i.e. its length in widths: see SOLID_MAX_LENGTH.
    if (core.length > SOLID_MAX_LENGTH * 0.8 * peak * peak) continue;
    for (const i of core) {
      const cx = i % width;
      const cy = (i - cx) / width;
      const r = Math.ceil(dist[i]) + 1;
      for (let y = Math.max(0, cy - r); y <= Math.min(height - 1, cy + r); y++) {
        for (let x = Math.max(0, cx - r); x <= Math.min(width - 1, cx + r); x++) {
          const j = y * width + x;
          if (ink[j] && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) solid[j] = 1;
        }
      }
    }
  }

  // Parts far thicker than the drawing's lines (a heavy brush band around an eye, a filled
  // patch) are drawn by their outline however long they are: their centre line alone would
  // lose the shape. Bold lines stay well under this.
  // Morphological opening: every ink pixel inside a disc of radius `band` that fits in the ink.
  // It covers the thick part right up to its edge; narrow tips and lines stay out.
  const band = Math.max(BAND_MIN_HALF_WIDTH, BAND_THICKNESS * lineHalf);
  const notCore = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) notCore[i] = dist[i] >= band ? 0 : 1;
  const toCore = inkDistance(notCore, width, height, false);
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && toCore[i] <= band + 0.5) solid[i] = 1;
  }

  // A separate ink shape that is short for its own thickness is a dot, however thin (a small
  // eye): its centre line would be a dash too short to draw, or erased by the thinning.
  const { labels, sizes } = labelRegions(ink, width, height, 1);
  const centreLength = new Float32Array(sizes.length);
  const peakHalf = new Float32Array(sizes.length);
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    centreLength[labels[i]] += skeleton[i];
    peakHalf[labels[i]] = Math.max(peakHalf[labels[i]], dist[i]);
  }
  for (let i = 0; i < ink.length; i++) {
    const l = labels[i];
    if (ink[i] && centreLength[l] <= SOLID_MAX_LENGTH * peakHalf[l]) solid[i] = 1;
  }

  // The discs can fall a pixel short of the ink's edge where it steps; grow the shapes over
  // the ink so their outline has no holes.
  for (let pass = 0; pass < SOLID_GROW_PX; pass++) {
    const grown = solid.slice();
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!ink[i] || solid[i]) continue;
        if (solid[i - 1] || solid[i + 1] || solid[i - width] || solid[i + width]) grown[i] = 1;
      }
    }
    solid.set(grown);
  }

  // Inside solid shapes: drop the centre lines and draw the edge against the paper instead.
  const outline = new Uint8Array(ink.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!solid[i]) continue;
      paths[i] = 0;
      const onEdge =
        (x > 0 && !ink[i - 1]) ||
        (x < width - 1 && !ink[i + 1]) ||
        (y > 0 && !ink[i - width]) ||
        (y < height - 1 && !ink[i + width]);
      if (onEdge) paths[i] = outline[i] = 1;
    }
  }

  // A line running into a solid shape now stops at the shape, about half a line width short
  // of its outline. Bridge each such cut to the nearest outline pixel so the join is drawn.
  const reach = Math.ceil(2 * lineHalf) + SOLID_GROW_PX + 1;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!paths[i] || solid[i] || outline[i]) continue;
      let cut = false;
      for (let dy = -1; dy <= 1 && !cut; dy++) {
        for (let dx = -1; dx <= 1; dx++)
          if (skeleton[i + dy * width + dx] && solid[i + dy * width + dx]) cut = true;
      }
      if (!cut) continue;
      let best = -1;
      let bestDistance = Infinity;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !outline[ny * width + nx])
            continue;
          const d = Math.hypot(dx, dy);
          if (d < bestDistance) {
            bestDistance = d;
            best = ny * width + nx;
          }
        }
      }
      if (best < 0) continue;
      const bx = best % width;
      const by = (best - bx) / width;
      const steps = Math.max(Math.abs(bx - x), Math.abs(by - y));
      for (let k = 1; k < steps; k++) {
        paths[
          Math.round(y + ((by - y) * k) / steps) * width + Math.round(x + ((bx - x) * k) / steps)
        ] = 1;
      }
    }
  }
  return paths;
}

/** How far (pixels) a chain end may reach to touch the line or outline it stops short of. */
const JUNCTION_REACH = 2;

/**
 * Traced chains stop short of the line they join: by one pixel at a T-junction (that pixel
 * belongs to the other chain), by up to two where a line meets a solid shape's outline.
 * Extends each chain end onto the nearest pen-path pixel within reach that isn't part of its
 * own last few points, so joins are drawn closed instead of with a 0.5–1 mm gap.
 */
export function closeJunctions(
  chains: Polyline[],
  paths: Uint8Array,
  width: number,
  height: number
): Polyline[] {
  const extend = (chain: Polyline, atEnd: boolean): Polyline => {
    const tip = atEnd ? chain[chain.length - 1] : chain[0];
    const own = new Set((atEnd ? chain.slice(-8) : chain.slice(0, 8)).map((p) => `${p.x},${p.y}`));
    let best: Point | null = null;
    let bestDistance = Infinity;
    for (let dy = -JUNCTION_REACH; dy <= JUNCTION_REACH; dy++) {
      for (let dx = -JUNCTION_REACH; dx <= JUNCTION_REACH; dx++) {
        const x = tip.x + dx;
        const y = tip.y + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= width || y >= height) continue;
        if (!paths[y * width + x] || own.has(`${x},${y}`)) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestDistance) {
          bestDistance = d;
          best = { x, y };
        }
      }
    }
    if (!best) return chain;
    return atEnd ? [...chain, best] : [best, ...chain];
  };
  return chains.map((chain) => (chain.length < 2 ? chain : extend(extend(chain, true), false)));
}
