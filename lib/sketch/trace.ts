import type { Point, Polyline } from './types';

// 8-connected neighbours, orthogonal first so traced lines prefer straight steps.
const NEIGHBOURS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;

/**
 * Turns a binary edge map into polylines by walking connected edge pixels.
 * Line endpoints are traced first so open curves come out as a single stroke;
 * whatever remains afterwards are closed loops.
 */
export function traceEdges(edges: Uint8Array, width: number, height: number): Polyline[] {
  const visited = new Uint8Array(edges.length);
  const strokes: Polyline[] = [];

  const isEdge = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && edges[y * width + x] === 1;

  const neighbourCount = (x: number, y: number) => {
    let n = 0;
    for (const [dx, dy] of NEIGHBOURS) if (isEdge(x + dx, y + dy)) n++;
    return n;
  };

  const walk = (startX: number, startY: number): Polyline => {
    const line: Point[] = [{ x: startX, y: startY }];
    visited[startY * width + startX] = 1;
    let x = startX;
    let y = startY;
    let prevDx = 0;
    let prevDy = 0;
    for (;;) {
      // Prefer the unvisited neighbour that keeps the current heading.
      let best: [number, number] | null = null;
      let bestScore = -Infinity;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isEdge(nx, ny) || visited[ny * width + nx]) continue;
        const score = dx * prevDx + dy * prevDy;
        if (score > bestScore) {
          bestScore = score;
          best = [dx, dy];
        }
      }
      if (!best) break;
      x += best[0];
      y += best[1];
      prevDx = best[0];
      prevDy = best[1];
      visited[y * width + x] = 1;
      line.push({ x, y });
    }
    return line;
  };

  for (const endpointsOnly of [true, false]) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!edges[i] || visited[i]) continue;
        if (endpointsOnly && neighbourCount(x, y) !== 1) continue;
        strokes.push(walk(x, y));
      }
    }
  }
  return strokes;
}
