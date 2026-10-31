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
/** Grey fills are grown up to this many grey levels above the ink threshold... */
const GREY_FILL_MARGIN = 50;
/** ...as areas within this many grey levels of where they started (so grey never joins black). */
const GREY_FILL_TOLERANCE = 18;
/** Grey fill pixels have at most this much colour (max − min channel). */
const GREY_FILL_MAX_CHROMA = 50;
/** Grey fills are at least this bright (black fills and outlines stay ink)... */
const GREY_FILL_MIN_LUMA = 30;
/** ...and is at least this share of the longest side across (half-width): wider than any line. */
const GREY_FILL_MIN_HALF_SHARE = 0.012;
/** RGB distance within which pixels belong to the same flat-colour region. */
const COLOUR_REGION_TOLERANCE = 48;
/** A coloured line's half-width: at least this many pixels and this share of the black lines'... */
const COLOURED_LINE_MIN_HALF_PX = 2.5;
const COLOURED_LINE_MIN_SHARE = 0.35;
/** ...and at most this share (+1 px). */
const COLOURED_LINE_MAX_SHARE = 2.4;
/** A coloured line is at least this many of its widths long. */
const COLOURED_LINE_MIN_LENGTH = 4;
/** At most this share of a coloured line's edge touches black ink (else a squeezed fill). */
const COLOURED_LINE_MAX_INK_BORDER = 0.25;
/** A coloured line's brightness varies by at most this standard deviation (grey levels). */
const COLOURED_LINE_MAX_SPREAD = 10;
/** A coloured line's typical thickness along its middle is at least this share of its thickest. */
const COLOURED_LINE_MIN_EVENNESS = 0.55;
/** A coloured line with more of its edge than this next to other coloured lines is a fill strip. */
const COLOURED_LINE_MAX_SHARED_EDGE = 0.4;
/** Edge pixels within this distance (pixels) of black ink count as touching it. */
const COLOURED_LINE_INK_REACH = 3;
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
    removeGreyFills(mask, luma, data, width, height, threshold);
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

/**
 * Dark grey fills (a grey suit, a shaded grey object) straddle the ink threshold: their darker
 * parts would be ink and their lighter parts not, so they'd be traced as ragged patches. Grows
 * areas of similar brightness and takes those that are wide and, on average, grey rather than
 * black out of the ink; their black outlines stay.
 */
function removeGreyFills(
  mask: Uint8Array,
  luma: Uint8Array,
  data: Uint8Array,
  width: number,
  height: number,
  threshold: number
) {
  const n = width * height;
  const limit = threshold + GREY_FILL_MARGIN;
  // Grey: little colour. Dark coloured pixels (dark green needles, a brown basket) are handled
  // by the colour rules and must not join a grey area of similar brightness.
  const grey = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const chroma =
      Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]);
    grey[i] =
      luma[i] >= GREY_FILL_MIN_LUMA && luma[i] < limit && chroma <= GREY_FILL_MAX_CHROMA ? 1 : 0;
  }
  const region = new Int32Array(n).fill(-1);
  const members: number[][] = [];
  for (let seed = 0; seed < n; seed++) {
    // Started only from clearly grey pixels, and never growing into black (below
    // GREY_FILL_MIN_LUMA), so an area can't take in the black outline around it.
    if (region[seed] >= 0 || !grey[seed]) continue;
    if (luma[seed] < GREY_FILL_MIN_LUMA + GREY_FILL_TOLERANCE) continue;
    const id = members.length;
    const list = [seed];
    region[seed] = id;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = i % width;
      for (const j of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]) {
        if (j < 0 || j >= n || region[j] >= 0 || !grey[j]) continue;
        if (Math.abs(luma[j] - luma[seed]) > GREY_FILL_TOLERANCE) continue;
        region[j] = id;
        list.push(j);
      }
    }
    members.push(list);
  }
  const minHalf = Math.max(4, GREY_FILL_MIN_HALF_SHARE * Math.max(width, height));
  const area = new Uint8Array(n);
  for (const list of members) {
    if (list.length < Math.PI * minHalf * minHalf) continue;
    // Wide: some point at least minHalf from the area's edge. Checked on the area's bounding
    // box only, so each area costs its own size.
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    for (const i of list) {
      const x = i % width;
      const y = (i - x) / width;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const local = new Uint8Array(w * h);
    for (const i of list) {
      const x = i % width;
      local[((i - x) / width - y0) * w + x - x0] = 1;
    }
    const dist = inkDistance(local, w, h);
    let peak = 0;
    for (let k = 0; k < dist.length; k++) peak = Math.max(peak, dist[k]);
    if (peak < minHalf) continue;
    for (const i of list) area[i] = 1;
  }
  for (let i = 0; i < n; i++) if (area[i]) mask[i] = 0;
}

/**
 * Lines drawn in a colour other than black (a brown window bar, a blue halo, a white rib on
 * blue, a grey net): areas of one flat colour that are about as thin as the drawing's black
 * lines and long, added to the ink. Not added: anti-aliasing slivers along fill edges (far
 * thinner), fills (thicker), and strips of fill squeezed between two black lines (bordered
 * mostly by black ink).
 */
function addColouredLines(
  mask: Uint8Array,
  data: Uint8Array,
  width: number,
  height: number
): boolean {
  const n = width * height;
  const blackHalf = ridgeHalfWidth(mask, width, height);
  if (!blackHalf) return false;
  // Flat-colour regions: grown from a seed while within COLOUR_REGION_TOLERANCE of its colour.
  const region = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < n; seed++) {
    if (region[seed] >= 0 || mask[seed]) continue;
    const id = sizes.length;
    const r0 = data[seed * 4];
    const g0 = data[seed * 4 + 1];
    const b0 = data[seed * 4 + 2];
    let size = 0;
    region[seed] = id;
    stack.push(seed);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      for (const j of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]) {
        if (j < 0 || j >= n || region[j] >= 0 || mask[j]) continue;
        const dr = data[j * 4] - r0;
        const dg = data[j * 4 + 1] - g0;
        const db = data[j * 4 + 2] - b0;
        if (dr * dr + dg * dg + db * db > COLOUR_REGION_TOLERANCE ** 2) continue;
        region[j] = id;
        stack.push(j);
      }
    }
    sizes.push(size);
  }
  // Half-width: distance to the nearest pixel of another region (or ink).
  const notInk = new Uint8Array(n);
  for (let i = 0; i < n; i++) notInk[i] = mask[i] ? 0 : 1;
  const toInk = inkDistance(notInk, width, height, false);
  const interior = new Uint8Array(n);
  const edgePixels = new Int32Array(sizes.length);
  const inkEdgePixels = new Int32Array(sizes.length);
  const touchesBorder = new Uint8Array(sizes.length);
  for (let i = 0; i < n; i++) {
    const id = region[i];
    if (id < 0) continue;
    const x = i % width;
    const y = (i - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      touchesBorder[id] = 1;
      continue;
    }
    let edge = false;
    for (const j of [i - width, i + width, i - 1, i + 1]) if (region[j] !== id) edge = true;
    if (edge) {
      edgePixels[id]++;
      // Anti-aliased pixels between a band and a black line form their own thin region, so
      // "touching" ink means within a few pixels of it.
      if (toInk[i] <= COLOURED_LINE_INK_REACH) inkEdgePixels[id]++;
    } else interior[i] = 1;
  }
  const dist = inkDistance(interior, width, height);
  const peak = new Float32Array(sizes.length);
  for (let i = 0; i < n; i++)
    if (region[i] >= 0) peak[region[i]] = Math.max(peak[region[i]], dist[i]);
  // Thickness along each region's ridge (its middle): even for a drawn line, tapering for a
  // sliver of fill (wide in the middle, pointed at the ends).
  const ridge: number[][] = sizes.map(() => []);
  for (let i = 0; i < n; i++) {
    const id = region[i];
    if (id < 0 || !dist[i]) continue;
    const x = i % width;
    if (x === 0 || x === width - 1 || i < width || i >= n - width) continue;
    let top = true;
    for (const j of [
      i - width - 1,
      i - width,
      i - width + 1,
      i - 1,
      i + 1,
      i + width - 1,
      i + width,
      i + width + 1,
    ]) {
      if (region[j] === id && dist[j] > dist[i]) top = false;
    }
    if (top) ridge[id].push(dist[i]);
  }
  // Drawn lines are one flat colour; bands of a smooth gradient (shading in a photo) are not.
  const sum = new Float64Array(sizes.length);
  const sumSq = new Float64Array(sizes.length);
  for (let i = 0; i < n; i++) {
    const id = region[i];
    if (id < 0) continue;
    const l = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    sum[id] += l;
    sumSq[id] += l * l;
  }
  const flat = (id: number) => {
    const mean = sum[id] / sizes[id];
    return sumSq[id] / sizes[id] - mean * mean <= COLOURED_LINE_MAX_SPREAD ** 2;
  };
  const evenWidth = (id: number) => {
    const r = ridge[id].sort((a, b) => a - b);
    return (
      r.length > 0 &&
      r[Math.floor(r.length / 2)] + 0.5 >= COLOURED_LINE_MIN_EVENNESS * (peak[id] + 0.5)
    );
  };
  const isLine = sizes.map((size, id) => {
    const half = peak[id] + 0.5;
    return (
      !touchesBorder[id] &&
      half >= Math.max(COLOURED_LINE_MIN_HALF_PX, COLOURED_LINE_MIN_SHARE * blackHalf) &&
      half <= COLOURED_LINE_MAX_SHARE * blackHalf + 1 &&
      size >= COLOURED_LINE_MIN_LENGTH * (2 * half) ** 2 &&
      inkEdgePixels[id] <= COLOURED_LINE_MAX_INK_BORDER * edgePixels[id] &&
      evenWidth(id) &&
      flat(id)
    );
  });
  // A strip of fill cut into thin pieces by coloured lines on both sides (the blue between
  // white ribs) passes the tests above too; it is mostly bordered by other candidates. Drop
  // those, most-bordered first, until none is left.
  const reach = COLOURED_LINE_INK_REACH;
  for (;;) {
    const bordered = new Int32Array(sizes.length);
    const edges = new Int32Array(sizes.length);
    for (let i = 0; i < n; i++) {
      const id = region[i];
      if (id < 0 || !isLine[id] || interior[i]) continue;
      edges[id]++;
      const x = i % width;
      const y = (i - x) / width;
      let near = false;
      for (let dy = -reach; dy <= reach && !near; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const other = region[ny * width + nx];
          if (other >= 0 && other !== id && isLine[other]) {
            near = true;
            break;
          }
        }
      }
      if (near) bordered[id]++;
    }
    let worst = -1;
    let worstShare = COLOURED_LINE_MAX_SHARED_EDGE;
    for (let id = 0; id < sizes.length; id++) {
      if (!isLine[id] || !edges[id]) continue;
      const share = bordered[id] / edges[id];
      if (share > worstShare) {
        worstShare = share;
        worst = id;
      }
    }
    if (worst < 0) break;
    isLine[worst] = false;
  }
  for (let i = 0; i < n; i++) if (region[i] >= 0 && isLine[region[i]]) mask[i] = 1;
  return isLine.some((v) => v);
}

/**
 * The most common half-width of a mask's lines, from the ridge of its distance transform
 * (pixels at least as far from the edge as all their neighbours). 0 if the mask is empty.
 */
function ridgeHalfWidth(mask: Uint8Array, width: number, height: number): number {
  const dist = inkDistance(mask, width, height);
  const bins: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const d = dist[i];
      if (!d) continue;
      let ridge = true;
      for (let dy = -1; dy <= 1 && ridge; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (dist[i + dy * width + dx] > d) ridge = false;
      }
      if (!ridge) continue;
      const b = Math.round(d * 2);
      bins[b] = (bins[b] ?? 0) + 1;
    }
  }
  let best = 0;
  let bestCount = 0;
  for (let b = 0; b < bins.length; b++) {
    const count = (bins[b - 1] ?? 0) + (bins[b] ?? 0) + (bins[b + 1] ?? 0);
    if (count > bestCount) {
      bestCount = count;
      best = b;
    }
  }
  return best / 2;
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
 * Zhang–Suen thinning (with Lü & Wang's fix for diagonals): peels pixels off the ink until
 * every line is one pixel wide, keeping its middle and its connections.
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
          // b >= 3, not Zhang–Suen's 2 (Lü & Wang): with 2, a diagonal line that has thinned to
          // two pixels wide is removed entirely, both halves at once.
          if (b < 3 || b > 6) continue;
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
  let skeleton = thin(ink, width, height);
  let inkPixels = 0;
  let skeletonPixels = 0;
  for (let i = 0; i < ink.length; i++) {
    inkPixels += ink[i];
    skeletonPixels += skeleton[i];
  }
  const inkFraction = inkPixels / ink.length;
  const lineWidthPx = skeletonPixels ? inkPixels / skeletonPixels : 0;
  // Enough drawing: a long centre line, or (dark ink) enough ink, for drawings of solid shapes.
  const enoughLines =
    skeletonPixels >= (width + height) / 2 ||
    (kind === 'dark' && inkFraction >= DARK_MIN_SHAPES_INK_FRACTION);
  // Dark ink: a drawing is flat colour (cartoon, clip art, scan) with dark lines and fills;
  // a photo is textured everywhere, and nearly every photo has some thin dark ink. Black fills
  // are fine (they are outlined), so line width isn't limited here.
  // Contrast ink (pencil, marker, often photographed): thin lines on mostly bare paper.
  const isLineArt =
    kind === 'dark'
      ? enoughLines && inkFraction <= DARK_MAX_INK_FRACTION && flatness(image) >= MIN_FLATNESS
      : enoughLines &&
        inkFraction <= CONTRAST_MAX_INK_FRACTION &&
        lineWidthPx <= Math.max(3, MAX_LINE_WIDTH_FRACTION * Math.max(width, height)) &&
        lineWidthPx <= CONTRAST_MAX_WIDTH_SHARE * paperRadius(width, height);
  if (!isLineArt && !force) {
    return {
      isLineArt,
      ink: kind,
      inkFraction,
      lineWidthPx,
      inkMask: ink,
      skeleton,
      paths: skeleton,
    };
  }
  // Only once the picture is known to be a drawing: lines drawn in colours other than black.
  if (kind === 'dark' && addColouredLines(ink, image.data, width, height)) {
    skeleton = thin(ink, width, height);
  }
  const paths = penPaths(ink, skeleton, width, height);
  return { isLineArt, ink: kind, inkFraction, lineWidthPx, inkMask: ink, skeleton, paths };
}

/** Share of pixels in flat areas above which an image is drawn artwork, not a photo. */
const MIN_FLATNESS = 0.65;
/** A flat picture this much dark ink is a drawing even without long lines (paw prints). */
const DARK_MIN_SHAPES_INK_FRACTION = 0.05;
/** Dark ink may cover at most this share of a drawing (black fills included). */
const DARK_MAX_INK_FRACTION = 0.6;
/** Neighbourhood range (grey levels) up to which a pixel counts as flat. */
const FLAT_RANGE = 10;

/**
 * Share of pixels whose 3x3 neighbourhood varies by at most FLAT_RANGE grey levels. Drawn
 * artwork is mostly flat colour (0.8–0.95, JPEG included); photos are textured (0.05–0.6).
 */
function flatness({ data, width, height }: RgbaImage): number {
  const luma = new Uint8Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  let flat = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let min = 255;
      let max = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = luma[(y + dy) * width + x + dx];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (max - min <= FLAT_RANGE) flat++;
    }
  }
  return flat / Math.max(1, (width - 2) * (height - 2));
}

/** Thickness factor over the typical line's half-width at which ink counts as a solid shape. */
const SOLID_THICKNESS = 1.8;
/** A solid shape's thick core is at most this many peak half-widths long (else a bold line). */
const SOLID_MAX_LENGTH = 6;
/** Ink at least this many typical line half-widths thick is drawn by its outline, whatever its length. */
const BAND_THICKNESS = 3;
/**
 * Ink thicker than this share of the longest side (half-width) is a fill whatever the typical
 * line: in a drawing that is mostly fills (a pool ball, a chess piece) the "typical line" is a fill.
 */
const BAND_MAX_SHARE = 0.03;
/** ...and at least this thick (pixels), so drawings with hairlines don't outline ordinary lines. */
const BAND_MIN_HALF_WIDTH = 4;
/** Lines leaving a junction are at most this many typical half-widths thick. */
const JUNCTION_ARM_THICKNESS = 1.6;
/** A thick short spot with this many lines leaving it is a junction, not a solid shape. */
const JUNCTION_BRANCHES = 3;
/** A dot fills at least this share of the disc around its centre (an oval eye ~0.55, a dash less). */
const DOT_MIN_FILL = 0.5;
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
export function typicalHalfWidth(skeleton: Uint8Array, dist: Float32Array): number {
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
  // Centre-line pixels of ordinary lines: the arms of a crossing are these, the thick wings of
  // a filled shape (a bat logo) are not.
  const isLineSkeleton = (i: number) =>
    skeleton[i] === 1 && dist[i] <= JUNCTION_ARM_THICKNESS * lineHalf + 1;
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

  // The ink within each core pixel's own radius (+1) of it: a breadth-first growth from the
  // core, each pixel keeping the core pixel it came from. Marks the pixels with `id`.
  const mark = new Int32Array(ink.length);
  const owner = new Int32Array(ink.length);
  let shapeId = 0;
  const discUnion = (core: number[], id: number) => {
    const out: number[] = [];
    for (const i of core) {
      if (mark[i] === id) continue;
      mark[i] = id;
      owner[i] = i;
      out.push(i);
    }
    for (let k = 0; k < out.length; k++) {
      const i = out[k];
      const o = owner[i];
      const ox = o % width;
      const oy = (o - ox) / width;
      const r = dist[o] + 1;
      const x = i % width;
      for (const d of [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]) {
        const n = i + d;
        if (n < 0 || n >= ink.length || Math.abs((n % width) - x) > 1) continue;
        if (!ink[n] || mark[n] === id) continue;
        const nx = n % width;
        const ny = (n - nx) / width;
        if ((nx - ox) ** 2 + (ny - oy) ** 2 > r * r) continue;
        mark[n] = id;
        owner[n] = o;
        out.push(n);
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
    const shape = discUnion(core, ++shapeId);
    // Where three or more lines meet (an asterisk, a star), the crossing is thick and short
    // too, but it is a junction: keep the lines running through it.
    const id = shapeId;
    const inShape = (i: number) => mark[i] === id;
    if (branchesLeaving(shape, inShape, isLineSkeleton, width, height) >= JUNCTION_BRANCHES)
      continue;
    for (const j of shape) solid[j] = 1;
  }

  // Parts far thicker than the drawing's lines (a heavy brush band around an eye, a filled
  // patch) are drawn by their outline however long they are: their centre line alone would
  // lose the shape. Bold lines stay well under this.
  // Morphological opening: every ink pixel inside a disc of radius `band` that fits in the ink.
  // It covers the thick part right up to its edge; narrow tips and lines stay out.
  const band = Math.max(
    BAND_MIN_HALF_WIDTH,
    Math.min(BAND_THICKNESS * lineHalf, BAND_MAX_SHARE * Math.max(width, height))
  );
  const notCore = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) notCore[i] = dist[i] >= band ? 0 : 1;
  const toCore = inkDistance(notCore, width, height, false);
  const opened = new Uint8Array(ink.length);
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && toCore[i] <= band + 0.5) opened[i] = 1;
  }
  // A small thick spot where several lines cross (the middle of an asterisk drawn with a
  // thick pen) is a junction, not a fill.
  const parts = labelRegions(opened, width, height, 1);
  const members: number[][] = parts.sizes.map(() => []);
  for (let i = 0; i < ink.length; i++) if (opened[i]) members[parts.labels[i]].push(i);
  for (const part of members) {
    if (!part.length) continue;
    const small = part.length <= Math.PI * (2 * band) ** 2;
    const label = parts.labels[part[0]];
    const inPart = (i: number) => opened[i] === 1 && parts.labels[i] === label;
    if (
      small &&
      branchesLeaving(part, inPart, isLineSkeleton, width, height) >= JUNCTION_BRANCHES
    ) {
      continue;
    }
    for (const i of part) solid[i] = 1;
  }

  // A separate ink shape that is short for its own thickness is a dot, however thin (a small
  // eye): its centre line would be a dash too short to draw, or erased by the thinning.
  // Only round-ish shapes, though: a short dash or an asterisk (a line cut by a colour, a
  // snowflake) reads better as its centre line, which thinning keeps for those shapes.
  const { labels, sizes } = labelRegions(ink, width, height, 1);
  const centreLength = new Float32Array(sizes.length);
  const peakHalf = new Float32Array(sizes.length);
  const sumX = new Float64Array(sizes.length);
  const sumY = new Float64Array(sizes.length);
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    const l = labels[i];
    centreLength[l] += skeleton[i];
    peakHalf[l] = Math.max(peakHalf[l], dist[i]);
    sumX[l] += i % width;
    sumY[l] += Math.floor(i / width);
  }
  const radius = new Float32Array(sizes.length);
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    const l = labels[i];
    const dx = (i % width) - sumX[l] / sizes[l];
    const dy = Math.floor(i / width) - sumY[l] / sizes[l];
    radius[l] = Math.max(radius[l], Math.hypot(dx, dy));
  }
  const isDot = (l: number) =>
    centreLength[l] <= SOLID_MAX_LENGTH * peakHalf[l] &&
    (centreLength[l] < 2 || sizes[l] >= DOT_MIN_FILL * Math.PI * (radius[l] + 0.5) ** 2);
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && isDot(labels[i])) solid[i] = 1;
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

/**
 * How many lines leave a shape: centre-line pixels (`onLine`) just outside it, grouped into
 * 8-connected runs.
 */
function branchesLeaving(
  shape: number[],
  inShape: (i: number) => boolean,
  onLine: (i: number) => boolean,
  width: number,
  height: number
): number {
  const exits = new Set<number>();
  for (const i of shape) {
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (onLine(n) && !inShape(n)) exits.add(n);
      }
    }
  }
  let runs = 0;
  const seen = new Set<number>();
  for (const start of exits) {
    if (seen.has(start)) continue;
    runs++;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % width;
      for (const d of [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]) {
        const n = i + d;
        if (Math.abs((n % width) - x) > 1 || !exits.has(n) || seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return runs;
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
