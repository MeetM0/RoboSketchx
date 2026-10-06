import { orderStrokes } from '../sketch/geometry';
import type { Sketch } from '../sketch/types';
import { CATALOG, type CatalogPicture } from './pictures';
import { flattenPath } from './svg-path';

export { CATALOG, CATALOG_CATEGORIES, type CatalogCategory, type CatalogPicture } from './pictures';

const cache = new Map<string, Sketch>();

/**
 * Turns a catalog picture into pen strokes, cropped to the drawing (plus a small border) so
 * it fills the paper. Results are cached; pictures never change at runtime.
 */
export function pictureToSketch(picture: CatalogPicture): Sketch {
  const cached = cache.get(picture.id);
  if (cached) return cached;

  const strokes = orderStrokes(picture.paths.flatMap((d) => flattenPath(d, 0.08)));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const pad = 1;
  const sketch: Sketch = {
    width: maxX - minX + 2 * pad,
    height: maxY - minY + 2 * pad,
    strokes: strokes.map((s) => s.map((p) => ({ x: p.x - minX + pad, y: p.y - minY + pad }))),
  };
  cache.set(picture.id, sketch);
  return sketch;
}

export function findPicture(id: string): CatalogPicture | undefined {
  return CATALOG.find((p) => p.id === id);
}
