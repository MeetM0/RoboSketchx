/**
 * Canny edge detection on a raw RGBA buffer.
 * Returns a 1-pixel-wide binary edge map (1 = edge) of size width * height.
 */
export function detectEdges(
  rgba: Uint8Array,
  width: number,
  height: number,
  blurSigma: number,
  strongEdgeFraction: number,
  weakRatio: number,
  minContrast: number
): Uint8Array {
  const gray = toGrayscale(rgba, width, height);
  const blurred = blurSigma > 0 ? gaussianBlur(gray, width, height, blurSigma) : gray;
  const { magnitude, direction } = sobel(blurred, width, height);
  const thin = nonMaxSuppression(magnitude, direction, width, height);
  // Sobel responds with 8x the local slope; a step of `minContrast` grey levels blurred by
  // a Gaussian has a peak slope of minContrast / (sqrt(2π)·σ). Anything weaker is treated as
  // texture/noise even if it ranks highly, which keeps flat, noisy backgrounds blank.
  const floor = (8 * minContrast) / (Math.sqrt(2 * Math.PI) * Math.max(blurSigma, 0.5));
  const high = Math.max(floor, strengthThreshold(thin, strongEdgeFraction));
  return hysteresis(thin, width, height, high, high * weakRatio);
}

function toGrayscale(rgba: Uint8Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    const alpha = rgba[p + 3] / 255;
    // Rec. 601 luma; transparent pixels are treated as white paper.
    const luma = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    out[i] = luma * alpha + 255 * (1 - alpha);
  }
  return out;
}

function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number) {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  // Separable: horizontal pass then vertical pass, clamping at the borders.
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        acc += src[row + xx] * kernel[k + radius];
      }
      tmp[row + x] = acc;
    }
  }
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        acc += tmp[yy * width + x] * kernel[k + radius];
      }
      out[y * width + x] = acc;
    }
  }
  return out;
}

function sobel(src: Float32Array, width: number, height: number) {
  const magnitude = new Float32Array(src.length);
  // Gradient direction quantised to 0 (horizontal), 1 (45°), 2 (vertical), 3 (135°).
  const direction = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = src[i - width - 1];
      const t = src[i - width];
      const tr = src[i - width + 1];
      const l = src[i - 1];
      const r = src[i + 1];
      const bl = src[i + width - 1];
      const b = src[i + width];
      const br = src[i + width + 1];
      const gx = tr + 2 * r + br - tl - 2 * l - bl;
      const gy = bl + 2 * b + br - tl - 2 * t - tr;
      magnitude[i] = Math.hypot(gx, gy);
      let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (angle < 0) angle += 180;
      direction[i] = angle < 22.5 || angle >= 157.5 ? 0 : angle < 67.5 ? 1 : angle < 112.5 ? 2 : 3;
    }
  }
  return { magnitude, direction };
}

function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Uint8Array,
  width: number,
  height: number
): Float32Array {
  const out = new Float32Array(magnitude.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const m = magnitude[i];
      if (m === 0) continue;
      let a: number;
      let b: number;
      switch (direction[i]) {
        case 0:
          a = magnitude[i - 1];
          b = magnitude[i + 1];
          break;
        case 1:
          // Image y points down, so a 45° gradient runs from top-left to bottom-right.
          a = magnitude[i - width - 1];
          b = magnitude[i + width + 1];
          break;
        case 2:
          a = magnitude[i - width];
          b = magnitude[i + width];
          break;
        default:
          a = magnitude[i - width + 1];
          b = magnitude[i + width - 1];
      }
      if (m >= a && m >= b) out[i] = m;
    }
  }
  return out;
}

/** Picks the magnitude above which the strongest `fraction` of all pixels lie. */
function strengthThreshold(thin: Float32Array, fraction: number): number {
  let max = 0;
  for (let i = 0; i < thin.length; i++) if (thin[i] > max) max = thin[i];
  if (max === 0) return Infinity;

  const bins = 1024;
  const histogram = new Uint32Array(bins);
  let count = 0;
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] > 0) {
      histogram[Math.min(bins - 1, Math.floor((thin[i] / max) * bins))]++;
      count++;
    }
  }
  const target = Math.min(count, thin.length * fraction);
  let seen = 0;
  for (let bin = bins - 1; bin >= 0; bin--) {
    seen += histogram[bin];
    if (seen >= target) return (bin / bins) * max;
  }
  return 0;
}

function hysteresis(
  thin: Float32Array,
  width: number,
  height: number,
  high: number,
  low: number
): Uint8Array {
  const edges = new Uint8Array(thin.length);
  const stack: number[] = [];
  for (let i = 0; i < thin.length; i++) {
    if (thin[i] >= high && thin[i] > 0 && !edges[i]) {
      edges[i] = 1;
      stack.push(i);
      // Grow the strong edge through connected weak-edge pixels.
      while (stack.length) {
        const j = stack.pop()!;
        const x = j % width;
        const y = (j - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const n = ny * width + nx;
            if (!edges[n] && thin[n] >= low && thin[n] > 0) {
              edges[n] = 1;
              stack.push(n);
            }
          }
        }
      }
    }
  }
  return edges;
}
