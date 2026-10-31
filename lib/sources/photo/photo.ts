import type { DetailLevel, RgbaImage, Sketch } from '../../geometry/types';
import type { PlotterSettings } from '../../plot/settings';
import { applyMask, removeBackground, type BackgroundRemoval } from './background';
import { checkLineArt, inkMask, measureLineArt } from './centerline';
import { labelRegions } from './morphology';
import { DETAIL_PRESETS, imageToSketch, lineArtToSketch } from './pipeline';

/**
 * Longest side of the photo the app decodes (crop source). Large, so a small drawing in a big
 * picture (a screenshot, a page photo) still has its own pixels after cropping.
 */
export const PHOTO_WORK_SIZE = 2048;
/** Longest side of the image that is traced as a photo, and of the detection preview. */
export const TRACE_SIZE = 512;
/**
 * Longest side of a line drawing when traced. Higher than photos: thin lines must stay a few
 * pixels wide to survive thinning, and centre-line tracing has no blur to pay for.
 */
export const LINE_TRACE_SIZE = 1024;
/** Border kept around the subject when cropping, as a fraction of the subject's longest side. */
const CROP_PADDING = 0.06;

export type CropRect = { x: number; y: number; width: number; height: number };

export type PhotoSketch = {
  sketch: Sketch;
  /** The image that was traced (cropped and resized). */
  traced: RgbaImage;
  /** Where `traced` came from, in the input image's pixels. */
  crop: CropRect;
  /** Background removal on `traced` (null when removal was off). */
  removal: BackgroundRemoval | null;
  /** How the strokes were traced: centre of ink lines, or edges of shapes. */
  trace: 'lines' | 'edges';
};

/**
 * `lines` traces the middle of dark lines (cartoons, inked drawings); `edges` traces the
 * outlines of shapes (photos); `auto` picks `lines` when the image looks like a line drawing.
 */
export type TraceMode = 'auto' | 'lines' | 'edges';

export type PhotoOptions = {
  detail: DetailLevel;
  removeBackground: boolean;
  settings: PlotterSettings;
  /** Defaults to `auto`. */
  trace?: TraceMode;
};

/**
 * Photo → pen strokes. Line drawings are traced through the middle of each ink line, photos
 * along the edges of shapes (`trace`, auto-detected by default). With background removal on, the subject is found first and the photo
 * is cropped to it (plus padding) *before* being resized for tracing, so the subject gets the
 * full trace resolution instead of the share of the frame it happened to occupy.
 */
export function photoToSketch(image: RgbaImage, options: PhotoOptions): PhotoSketch {
  const mode = options.trace ?? 'auto';
  const preset = DETAIL_PRESETS[options.detail];
  const preview = resizeImage(image, TRACE_SIZE);
  const k = image.width / preview.width;

  // Line drawings: the paper is the background and every stroke matters, so crop to all of
  // the ink rather than to a "subject" (which can be one enclosed patch of paper).
  const previewArt = mode === 'edges' ? null : checkLineArt(preview);
  if (mode === 'lines' || (mode === 'auto' && previewArt?.isLineArt)) {
    const kind = previewArt?.isLineArt ? previewArt.ink : 'dark';
    const ink = previewArt?.isLineArt ? previewArt.inkMask : inkMask(preview, kind);
    const { bounds, marks } = drawingBounds(ink, preview.width, preview.height);
    const crop = padCrop(bounds, k, image);
    const traced = resizeImage(cropImage(eraseMarks(image, marks, k), crop), LINE_TRACE_SIZE);
    const art = measureLineArt(traced, kind, true);
    return {
      sketch: lineArtToSketch(traced, preset, mmPerPxFor(traced, options.settings), art.paths),
      traced,
      crop,
      removal: null,
      trace: 'lines',
    };
  }

  let crop: CropRect = { x: 0, y: 0, width: image.width, height: image.height };
  if (options.removeBackground) {
    const found = removeBackground(preview);
    if (found.ok) crop = padCrop(maskBounds(found.mask, preview.width, preview.height), k, image);
  }
  const traced = resizeImage(cropImage(image, crop), TRACE_SIZE);
  let input = traced;
  let removal: BackgroundRemoval | null = null;
  if (options.removeBackground) {
    removal = removeBackground(traced);
    if (removal.ok) input = applyMask(traced, removal.mask);
  }
  return {
    sketch: imageToSketch(input, preset, mmPerPxFor(traced, options.settings)),
    traced,
    crop,
    removal,
    trace: 'edges',
  };
}

/**
 * The crop is the drawing plus padding, so fitting the traced frame to the printable area gives
 * the scale the strokes will be drawn at; the preset's mm thresholds use it.
 */
function mmPerPxFor(traced: RgbaImage, s: PlotterSettings) {
  return Math.min(
    (s.paperWidthMm - 2 * s.marginMm) / traced.width,
    (s.paperHeightMm - 2 * s.marginMm) / traced.height
  );
}

/** A preview-pixel box → the input image's pixels, padded by CROP_PADDING and clamped. */
function padCrop(b: CropRect, k: number, image: RgbaImage): CropRect {
  const pad = Math.max(b.width, b.height) * k * CROP_PADDING;
  const x0 = Math.max(0, Math.floor(b.x * k - pad));
  const y0 = Math.max(0, Math.floor(b.y * k - pad));
  const x1 = Math.min(image.width, Math.ceil((b.x + b.width) * k + pad));
  const y1 = Math.min(image.height, Math.ceil((b.y + b.height) * k + pad));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Ink marks touching the picture's edge and this small a share of all ink are left out. */
const EDGE_MARK_MAX_SHARE = 0.1;
/** How close to the picture's edge such a mark sits, as a share of the longest side. */
const EDGE_MARK_MARGIN = 0.02;

/**
 * Bounds of the drawing's ink, leaving out small marks at the picture's edge (a logo
 * or watermark in a corner, a scanner's dark border). The marks' boxes are returned too: the
 * drawing can reach the same edge, so the crop alone doesn't always cut them off.
 */
function drawingBounds(
  ink: Uint8Array,
  width: number,
  height: number
): { bounds: CropRect; marks: CropRect[] } {
  const { labels, sizes, touchesBorder } = labelRegions(ink, width, height, 1);
  // Watermarks usually sit a few pixels in from the edge, not on it.
  const m = Math.max(1, Math.round(EDGE_MARK_MARGIN * Math.max(width, height)));
  const nearEdge = new Uint8Array(sizes.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (ink[i] && (x <= m || y <= m || x >= width - 1 - m || y >= height - 1 - m))
        nearEdge[labels[i]] = 1;
    }
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  const isMark = (l: number) =>
    (nearEdge[l] || touchesBorder[l]) && sizes[l] < EDGE_MARK_MAX_SHARE * total;
  const keep = new Uint8Array(ink.length);
  const markMasks = new Map<number, Uint8Array>();
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i]) continue;
    const l = labels[i];
    if (!isMark(l)) {
      keep[i] = 1;
      continue;
    }
    let mask = markMasks.get(l);
    if (!mask) markMasks.set(l, (mask = new Uint8Array(ink.length)));
    mask[i] = 1;
  }
  const marks = [...markMasks.values()].map((m) => maskBounds(m, width, height));
  return { bounds: maskBounds(keep, width, height), marks };
}

/** Paints each preview-pixel box (plus a pixel of margin) white in the input image. */
function eraseMarks(image: RgbaImage, marks: CropRect[], k: number): RgbaImage {
  if (!marks.length) return image;
  const data = new Uint8Array(image.data);
  for (const m of marks) {
    const x0 = Math.max(0, Math.floor((m.x - 1) * k));
    const y0 = Math.max(0, Math.floor((m.y - 1) * k));
    const x1 = Math.min(image.width, Math.ceil((m.x + m.width + 1) * k));
    const y1 = Math.min(image.height, Math.ceil((m.y + m.height + 1) * k));
    for (let y = y0; y < y1; y++)
      data.fill(255, (y * image.width + x0) * 4, (y * image.width + x1) * 4);
  }
  return { width: image.width, height: image.height, data };
}

function maskBounds(mask: Uint8Array, width: number, height: number): CropRect {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0
    ? { x: 0, y: 0, width, height }
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function cropImage(image: RgbaImage, rect: CropRect): RgbaImage {
  if (rect.x === 0 && rect.y === 0 && rect.width === image.width && rect.height === image.height) {
    return image;
  }
  const data = new Uint8Array(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * image.width + rect.x) * 4;
    data.set(image.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}

/**
 * Resizes so the longest side is `maxSide`: area-averaging when shrinking (no aliasing),
 * bilinear when enlarging (small crops).
 */
export function resizeImage(image: RgbaImage, maxSide: number): RgbaImage {
  const longest = Math.max(image.width, image.height);
  if (longest === maxSide) return image;
  const k = maxSide / longest;
  const width = Math.max(1, Math.round(image.width * k));
  const height = Math.max(1, Math.round(image.height * k));
  const data = new Uint8Array(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (k < 1) {
        // Average every source pixel whose centre falls in this output pixel's footprint.
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        const y0 = Math.floor(y * sy);
        const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
        const sums = [0, 0, 0, 0];
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * image.width + xx) * 4;
            for (let c = 0; c < 4; c++) sums[c] += image.data[i + c];
          }
        }
        const n = (x1 - x0) * (y1 - y0);
        for (let c = 0; c < 4; c++) data[o + c] = sums[c] / n;
      } else {
        const fx = Math.min(image.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
        const fy = Math.min(image.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(image.width - 1, x0 + 1);
        const y1 = Math.min(image.height - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        for (let c = 0; c < 4; c++) {
          const p = (xx: number, yy: number) => image.data[(yy * image.width + xx) * 4 + c];
          data[o + c] =
            (p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) +
            (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty;
        }
      }
    }
  }
  return { width, height, data };
}
