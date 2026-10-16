import { decode } from 'jpeg-js';

import { detectEdgeField, refineSubpixel } from './edges';
import {
  dropRedundantChains,
  linkChains,
  orderStrokes,
  polylineLength,
  simplify,
  smoothChain,
} from './geometry';
import { traceEdges } from './trace';
import { DEFAULT_PLOTTER_SETTINGS } from './export';
import type { DetailLevel, RgbaImage, Sketch, SketchOptions } from './types';

export {
  applyMask,
  backgroundPathData,
  removeBackground,
  type BackgroundRemoval,
} from './background';
export * from './export';
export {
  cropImage,
  photoToSketch,
  PHOTO_WORK_SIZE,
  resizeImage,
  TRACE_SIZE,
  type CropRect,
  type PhotoSketch,
} from './photo';
export { computeStats, joinStrokes } from './geometry';
export * from './types';

/** Joined chain ends must continue each other's direction within this angle. */
export const LINK_MAX_ANGLE_DEG = 45;
/** Chains entirely within this distance (traced px) of a longer chain are duplicates. */
export const REDUNDANT_TOLERANCE_PX = 1.5;

/** Gaussian σ (in traced pixels) used to smooth pixel chains before simplification. */
export const CHAIN_SMOOTHING_SIGMA_PX = 1.25;

/**
 * Detail presets. Size thresholds are in millimetres on paper and converted to traced pixels
 * with the scale the drawing will be plotted at, so results don't depend on photo resolution.
 */
export const DETAIL_PRESETS: Record<DetailLevel, SketchOptions> = {
  low: {
    blurSigma: 2.2,
    strongEdgeFraction: 0.03,
    minContrast: 40,
    weakRatio: 0.5,
    minStrokeLengthMm: 5,
    simplifyToleranceMm: 0.04,
    linkGapMm: 1,
  },
  medium: {
    blurSigma: 1.6,
    strongEdgeFraction: 0.05,
    minContrast: 25,
    weakRatio: 0.45,
    minStrokeLengthMm: 3,
    simplifyToleranceMm: 0.04,
    linkGapMm: 1,
  },
  high: {
    blurSigma: 1.1,
    strongEdgeFraction: 0.08,
    minContrast: 14,
    weakRatio: 0.4,
    minStrokeLengthMm: 1.5,
    simplifyToleranceMm: 0.04,
    linkGapMm: 1,
  },
};

/** Linking below ~1.5 px can't bridge a broken pixel chain, whatever the mm value says. */
const MIN_LINK_GAP_PX = 1.5;

/** Converts a preset's millimetre thresholds to traced pixels for a given scale. */
export function resolveThresholds(options: SketchOptions, mmPerPx: number) {
  return {
    minStrokeLengthPx: options.minStrokeLengthMm / mmPerPx,
    simplifyTolerancePx: options.simplifyToleranceMm / mmPerPx,
    linkGapPx: Math.max(MIN_LINK_GAP_PX, options.linkGapMm / mmPerPx),
  };
}

/** mm per pixel when an image frame is fitted into the default (A4) printable area. */
export function defaultMmPerPx(width: number, height: number) {
  const s = DEFAULT_PLOTTER_SETTINGS;
  return Math.min(
    (s.paperWidthMm - 2 * s.marginMm) / width,
    (s.paperHeightMm - 2 * s.marginMm) / height
  );
}

/**
 * Converts an image into ordered pen strokes. `mmPerPx` is the paper scale the result will be
 * drawn at; the preset's thresholds are in mm and converted with it.
 */
export function imageToSketch(
  { data, width, height }: RgbaImage,
  options: SketchOptions,
  mmPerPx = defaultMmPerPx(width, height)
): Sketch {
  const px = resolveThresholds(options, mmPerPx);
  const field = detectEdgeField(
    data,
    width,
    height,
    options.blurSigma,
    options.strongEdgeFraction,
    options.weakRatio,
    options.minContrast
  );
  const traced = dropRedundantChains(
    linkChains(traceEdges(field.edges, width, height), px.linkGapPx, LINK_MAX_ANGLE_DEG),
    REDUNDANT_TOLERANCE_PX
  );
  const strokes = traced
    .filter((s) => s.length > 1 && polylineLength(s) >= px.minStrokeLengthPx)
    .map((s) =>
      simplify(
        smoothChain(refineSubpixel(s, field), CHAIN_SMOOTHING_SIGMA_PX),
        px.simplifyTolerancePx
      )
    );
  // Machine X0 Y0 is the bottom-left of the paper: bottom-left of the image.
  return { width, height, strokes: orderStrokes(strokes, { x: 0, y: height }) };
}

/** Decodes a base64-encoded JPEG into RGBA pixels. */
export function decodeJpegBase64(base64: string): RgbaImage {
  const { data, width, height } = decode(base64ToBytes(base64), {
    useTArray: true,
    formatAsRGBA: true,
  });
  return { data, width, height };
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = new Uint8Array(128);
for (let i = 0; i < BASE64_ALPHABET.length; i++) BASE64_LOOKUP[BASE64_ALPHABET.charCodeAt(i)] = i;

// Hand-rolled so it behaves identically on Hermes, web and Node without polyfills.
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_LOOKUP[clean.charCodeAt(i)];
    const b = BASE64_LOOKUP[clean.charCodeAt(i + 1)];
    const c = BASE64_LOOKUP[clean.charCodeAt(i + 2)];
    const d = BASE64_LOOKUP[clean.charCodeAt(i + 3)];
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}
