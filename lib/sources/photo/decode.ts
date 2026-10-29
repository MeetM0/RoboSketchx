import { decode } from 'jpeg-js';

import { base64ToBytes } from '../../base64';
import type { RgbaImage } from '../../geometry/types';

/** Decodes a base64-encoded JPEG into RGBA pixels. */
export function decodeJpegBase64(base64: string): RgbaImage {
  const { data, width, height } = decode(base64ToBytes(base64), {
    useTArray: true,
    formatAsRGBA: true,
  });
  return { data, width, height };
}
