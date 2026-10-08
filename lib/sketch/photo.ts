import { applyMask, removeBackground, type BackgroundRemoval } from './background';
import type { PlotterSettings } from './export';
import { DETAIL_PRESETS, imageToSketch } from './index';
import type { DetailLevel, RgbaImage, Sketch } from './types';

/** Longest side of the photo the app decodes (crop source). */
export const PHOTO_WORK_SIZE = 1024;
/** Longest side of the image that is actually traced. */
export const TRACE_SIZE = 512;
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
};

export type PhotoOptions = {
  detail: DetailLevel;
  removeBackground: boolean;
  settings: PlotterSettings;
};

/**
 * Photo → pen strokes. With background removal on, the subject is found first and the photo
 * is cropped to it (plus padding) *before* being resized for tracing, so the subject gets the
 * full trace resolution instead of the share of the frame it happened to occupy.
 */
export function photoToSketch(image: RgbaImage, options: PhotoOptions): PhotoSketch {
  let crop: CropRect = { x: 0, y: 0, width: image.width, height: image.height };
  if (options.removeBackground) {
    const preview = resizeImage(image, TRACE_SIZE);
    const found = removeBackground(preview);
    if (found.ok) {
      const k = image.width / preview.width;
      const b = maskBounds(found.mask, preview.width, preview.height);
      const pad = Math.max(b.width, b.height) * k * CROP_PADDING;
      const x0 = Math.max(0, Math.floor(b.x * k - pad));
      const y0 = Math.max(0, Math.floor(b.y * k - pad));
      const x1 = Math.min(image.width, Math.ceil((b.x + b.width) * k + pad));
      const y1 = Math.min(image.height, Math.ceil((b.y + b.height) * k + pad));
      crop = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
  }

  const traced = resizeImage(cropImage(image, crop), TRACE_SIZE);
  let input = traced;
  let removal: BackgroundRemoval | null = null;
  if (options.removeBackground) {
    removal = removeBackground(traced);
    if (removal.ok) input = applyMask(traced, removal.mask);
  }
  // The crop is the subject plus padding, so fitting the traced frame to the printable area
  // gives the scale the strokes will be drawn at; the preset's mm thresholds use it.
  const s = options.settings;
  const mmPerPx = Math.min(
    (s.paperWidthMm - 2 * s.marginMm) / traced.width,
    (s.paperHeightMm - 2 * s.marginMm) / traced.height
  );
  return {
    sketch: imageToSketch(input, DETAIL_PRESETS[options.detail], mmPerPx),
    traced,
    crop,
    removal,
  };
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
