import { decode } from 'jpeg-js';

import { detectEdges } from './edges';
import { orderStrokes, polylineLength, simplify } from './geometry';
import { traceEdges } from './trace';
import type { DetailLevel, RgbaImage, Sketch, SketchOptions } from './types';

export { applyMask, backgroundPathData, removeBackground, type BackgroundRemoval } from './background';
export { DEFAULT_SCAN_OPTIONS, scanPage, type PageScan, type ScanOptions } from './centerline';
export * from './export';
export { computeStats } from './geometry';
export * from './types';

export const DETAIL_PRESETS: Record<DetailLevel, SketchOptions> = {
  low: {
    blurSigma: 2.2,
    strongEdgeFraction: 0.03,
    minContrast: 40,
    weakRatio: 0.5,
    minStrokeLength: 14,
    simplifyTolerance: 1.2,
  },
  medium: {
    blurSigma: 1.6,
    strongEdgeFraction: 0.05,
    minContrast: 25,
    weakRatio: 0.45,
    minStrokeLength: 8,
    simplifyTolerance: 0.9,
  },
  high: {
    blurSigma: 1.1,
    strongEdgeFraction: 0.08,
    minContrast: 14,
    weakRatio: 0.4,
    minStrokeLength: 4,
    simplifyTolerance: 0.6,
  },
};

/** Converts an image into ordered pen strokes. */
export function imageToSketch(
  { data, width, height }: RgbaImage,
  options: SketchOptions
): Sketch {
  const edges = detectEdges(
    data,
    width,
    height,
    options.blurSigma,
    options.strongEdgeFraction,
    options.weakRatio,
    options.minContrast
  );
  const strokes = traceEdges(edges, width, height)
    .filter((s) => s.length > 1 && polylineLength(s) >= options.minStrokeLength)
    .map((s) => simplify(s, options.simplifyTolerance));
  return { width, height, strokes: orderStrokes(strokes) };
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
