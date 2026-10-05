import type { Point, Polyline, SketchStats } from './types';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLength(line: Polyline): number {
  let length = 0;
  for (let i = 1; i < line.length; i++) length += dist(line[i - 1], line[i]);
  return length;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(line: Polyline, tolerance: number): Polyline {
  if (line.length <= 2 || tolerance <= 0) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(line[i], line[start], line[end]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Greedy nearest-neighbour ordering starting from the origin (where a plotter homes).
 * Strokes may be reversed so the pen starts at whichever end is closer.
 */
export function orderStrokes(strokes: Polyline[]): Polyline[] {
  const remaining = strokes.slice();
  const ordered: Polyline[] = [];
  let pen: Point = { x: 0, y: 0 };
  while (remaining.length) {
    let bestIndex = 0;
    let bestReversed = false;
    let bestDistance = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const toStart = dist(pen, s[0]);
      const toEnd = dist(pen, s[s.length - 1]);
      if (toStart < bestDistance) {
        bestDistance = toStart;
        bestIndex = i;
        bestReversed = false;
      }
      if (toEnd < bestDistance) {
        bestDistance = toEnd;
        bestIndex = i;
        bestReversed = true;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    const stroke = bestReversed ? next.slice().reverse() : next;
    ordered.push(stroke);
    pen = stroke[stroke.length - 1];
  }
  return ordered;
}

export function computeStats(strokes: Polyline[]): SketchStats {
  let pointCount = 0;
  let drawLength = 0;
  let travelLength = 0;
  let pen: Point = { x: 0, y: 0 };
  for (const s of strokes) {
    pointCount += s.length;
    drawLength += polylineLength(s);
    travelLength += dist(pen, s[0]);
    pen = s[s.length - 1];
  }
  return { strokeCount: strokes.length, pointCount, drawLength, travelLength };
}
