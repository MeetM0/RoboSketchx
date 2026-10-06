/** Binary-mask helpers (1 = set, 0 = clear) shared by background removal and page scanning. */

/** Separable square erosion (min filter). */
export function erode(mask: Uint8Array, width: number, height: number, radius: number) {
  return squareFilter(mask, width, height, radius, 1);
}

/** Separable square dilation (max filter). */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
  return squareFilter(mask, width, height, radius, 0);
}

/** For erosion a pixel survives only if no 0 is in range; for dilation if any 1 is. */
function squareFilter(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
  erodeMode: 0 | 1
) {
  const pass = (src: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let value = erodeMode;
        for (let k = -radius; k <= radius; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          // Outside the image counts as "same as erodeMode" so edges aren't eaten away.
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const v = src[yy * width + xx];
          if (erodeMode ? v === 0 : v === 1) {
            value = erodeMode ? 0 : 1;
            break;
          }
        }
        out[y * width + x] = value;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

/** Labels 8-connected regions where mask[i] === value; returns labels and region sizes. */
export function labelRegions(mask: Uint8Array, width: number, height: number, value: 0 | 1) {
  const labels = new Int32Array(mask.length).fill(-1);
  const sizes: number[] = [];
  const touchesBorder: boolean[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || labels[start] !== -1) continue;
    const label = sizes.length;
    let size = 0;
    let border = false;
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) border = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (mask[n] === value && labels[n] === -1) {
            labels[n] = label;
            stack.push(n);
          }
        }
      }
    }
    sizes.push(size);
    touchesBorder.push(border);
  }
  return { labels, sizes, touchesBorder };
}
