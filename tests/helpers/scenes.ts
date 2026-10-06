/**
 * Deterministic, procedurally drawn test images (no binary photos in the repo). They are
 * JPEG round-tripped so compression artefacts match what the app decodes.
 */
import { decode, encode } from 'jpeg-js';

import type { RgbaImage } from '../../lib/sketch/types';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function canvas(width: number, height: number, fill: (x: number, y: number) => number[]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function jpegRoundTrip(image: RgbaImage, quality = 88): RgbaImage {
  const jpeg = encode({ data: image.data, width: image.width, height: image.height }, quality);
  const out = decode(jpeg.data, { useTArray: true, formatAsRGBA: true });
  return { width: out.width, height: out.height, data: out.data };
}

/**
 * "Snoop": a cartoon dog bust in a portrait 384 × 512 photo — orange head and ears on a
 * blue-grey wall with a lighting gradient and sensor noise. The subject covers ~25% of the
 * frame, like the original snoop.gcode photo.
 */
export function snoopScene(width = 384, height = 512): RgbaImage {
  const noise = rng(11);
  const s = width / 384;
  const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  return jpegRoundTrip(
    canvas(width, height, (x, y) => {
      const n = (noise() - 0.5) * 22;
      let c = [120 + y * 0.12 / s, 140 + y * 0.1 / s, 170 - x * 0.05 / s];
      if (inEllipse(x, y, 140 * s, 250 * s, 34 * s, 70 * s) || inEllipse(x, y, 244 * s, 250 * s, 34 * s, 70 * s))
        c = [120, 70, 30]; // ears
      if (inEllipse(x, y, 192 * s, 250 * s, 70 * s, 82 * s)) c = [225, 150, 60]; // head
      if (inEllipse(x, y, 192 * s, 300 * s, 34 * s, 22 * s)) c = [245, 215, 170]; // muzzle
      if (inEllipse(x, y, 168 * s, 236 * s, 8 * s, 10 * s) || inEllipse(x, y, 216 * s, 236 * s, 8 * s, 10 * s))
        c = [25, 20, 20]; // eyes
      if (inEllipse(x, y, 192 * s, 288 * s, 11 * s, 7 * s)) c = [30, 25, 25]; // nose
      return [c[0] + n, c[1] + n, c[2] + n];
    })
  );
}

/** White paper with black ink drawn by `ink(x, y)`; mild noise, JPEG round-tripped. */
export function lineArt(width: number, height: number, ink: (x: number, y: number) => boolean) {
  const noise = rng(5);
  return jpegRoundTrip(
    canvas(width, height, (x, y) => {
      const n = (noise() - 0.5) * 8;
      const v = ink(x, y) ? 25 : 245;
      return [v + n, v + n, v + n];
    })
  );
}

/** A soft-edged grey disk on a darker grey background (not line art: one boundary edge). */
export function diskScene(width = 512, height = 384): RgbaImage {
  const noise = rng(9);
  return jpegRoundTrip(
    canvas(width, height, (x, y) => {
      const d = Math.hypot(x - width / 2, y - height / 2);
      const v = (d < 120 ? 190 : 90) + (noise() - 0.5) * 10;
      return [v, v, v];
    })
  );
}

/** Box-filter downscale by an integer factor. */
export function downscale(image: RgbaImage, factor: number): RgbaImage {
  const w = Math.floor(image.width / factor);
  const h = Math.floor(image.height / factor);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++)
          for (let dx = 0; dx < factor; dx++)
            sum += image.data[((y * factor + dy) * image.width + x * factor + dx) * 4 + c];
        data[(y * w + x) * 4 + c] = sum / (factor * factor);
      }
  return { width: w, height: h, data };
}
