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
 * Greedy nearest-neighbour ordering starting from `start` — pass where the plotter homes
 * (machine X0 Y0 is the paper's bottom-left, i.e. `{ x: 0, y: height }` in image space).
 * Strokes may be reversed so the pen starts at whichever end is closer.
 */
export function orderStrokes(strokes: Polyline[], start: Point): Polyline[] {
  const remaining = strokes.slice();
  const ordered: Polyline[] = [];
  let pen: Point = start;
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

/**
 * Joins consecutive strokes when one ends within `maxGap` of where the next begins, so the
 * pen stays down through the join instead of lifting and landing on the same spot (which
 * wastes time and leaves an ink blob, e.g. at every cursive letter connection).
 */
export function joinStrokes(strokes: Polyline[], maxGap: number): Polyline[] {
  const out: Polyline[] = [];
  for (const stroke of strokes) {
    const previous = out[out.length - 1];
    if (previous) {
      const end = previous[previous.length - 1];
      const gap = dist(end, stroke[0]);
      if (gap <= maxGap) {
        // Skip the duplicate point when the ends coincide exactly.
        previous.push(...(gap === 0 ? stroke.slice(1) : stroke));
        continue;
      }
    }
    out.push(stroke.slice());
  }
  return out;
}

/**
 * Gaussian-smooths a traced pixel chain (σ in points; chains from the tracer have ~1 px
 * spacing). Removes the 8-connected staircase so simplification keeps true directions instead
 * of 0/45/90° steps. Open chains keep their end points; closed loops (ends within `closeGap`)
 * wrap around and stay closed.
 */
export function smoothChain(chain: Polyline, sigma: number, closeGap = 1.5): Polyline {
  const n = chain.length;
  if (n < 3 || sigma <= 0) return chain;
  const closed = dist(chain[0], chain[n - 1]) <= closeGap;
  // A closed loop repeats its first point at the end; smooth the unique points.
  const points = closed && dist(chain[0], chain[n - 1]) === 0 ? chain.slice(0, -1) : chain;
  const m = points.length;
  const radius = Math.min(Math.ceil(sigma * 3), closed ? Math.floor((m - 1) / 2) : m);
  const weights = Array.from({ length: radius + 1 }, (_, k) =>
    Math.exp(-(k * k) / (2 * sigma * sigma))
  );
  const out: Polyline = [];
  for (let i = 0; i < m; i++) {
    if (!closed && (i === 0 || i === m - 1)) {
      out.push(points[i]);
      continue;
    }
    let x = 0;
    let y = 0;
    let total = 0;
    for (let k = -radius; k <= radius; k++) {
      let j = i + k;
      if (closed) j = (j + m) % m;
      else if (j < 0 || j >= m) continue;
      const w = weights[Math.abs(k)];
      x += points[j].x * w;
      y += points[j].y * w;
      total += w;
    }
    out.push({ x: x / total, y: y / total });
  }
  if (closed) out.push({ ...out[0] });
  return out;
}
