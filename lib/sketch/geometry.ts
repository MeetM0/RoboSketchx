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

/** Unit direction pointing out of a chain end (from a few points back towards the end). */
function outward(chain: Polyline, atEnd: boolean): Point {
  const n = chain.length;
  const k = Math.min(3, n - 1);
  const tip = atEnd ? chain[n - 1] : chain[0];
  const back = atEnd ? chain[n - 1 - k] : chain[k];
  const d = dist(tip, back) || 1;
  return { x: (tip.x - back.x) / d, y: (tip.y - back.y) / d };
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

/**
 * Joins traced chains whose ends are within `maxGap` and continue each other's direction
 * (within `maxAngleDeg`), and closes chains whose own ends meet the same way. Runs before the
 * short-stroke filter so a contour broken into short pieces isn't thrown away piece by piece.
 */
export function linkChains(chains: Polyline[], maxGap: number, maxAngleDeg: number): Polyline[] {
  const cosLimit = Math.cos((maxAngleDeg * Math.PI) / 180);
  const continues = (a: Point, aOut: Point, b: Point, bOut: Point) => {
    // b's chain must head back along a's direction, and the jump must point the same way.
    if (dot(aOut, { x: -bOut.x, y: -bOut.y }) < cosLimit) return false;
    const d = dist(a, b);
    if (d < 0.5) return true;
    return dot(aOut, { x: (b.x - a.x) / d, y: (b.y - a.y) / d }) >= cosLimit;
  };

  let pool = chains.filter((c) => c.length > 0).map((c) => c.slice());
  let merged = true;
  while (merged) {
    merged = false;
    let best: { i: number; j: number; iEnd: boolean; jEnd: boolean; d: number } | null = null;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].length < 2) continue;
      for (let j = i + 1; j < pool.length; j++) {
        if (pool[j].length < 2) continue;
        for (const iEnd of [true, false]) {
          for (const jEnd of [true, false]) {
            const a = iEnd ? pool[i][pool[i].length - 1] : pool[i][0];
            const b = jEnd ? pool[j][pool[j].length - 1] : pool[j][0];
            const d = dist(a, b);
            if (d > maxGap || (best && d >= best.d)) continue;
            if (continues(a, outward(pool[i], iEnd), b, outward(pool[j], jEnd))) {
              best = { i, j, iEnd, jEnd, d };
            }
          }
        }
      }
    }
    if (best) {
      const first = best.iEnd ? pool[best.i] : pool[best.i].slice().reverse();
      const second = best.jEnd ? pool[best.j].slice().reverse() : pool[best.j];
      pool[best.i] = [...first, ...(best.d === 0 ? second.slice(1) : second)];
      pool.splice(best.j, 1);
      merged = true;
    }
  }

  // Close loops: a chain whose end comes back to its start.
  pool = pool.map((c) => {
    if (c.length < 4) return c;
    const a = c[c.length - 1];
    const b = c[0];
    if (dist(a, b) === 0) return c;
    if (dist(a, b) <= maxGap && continues(a, outward(c, true), b, outward(c, false))) {
      return [...c, { ...b }];
    }
    return c;
  });
  return pool;
}

/**
 * Drops chains that only retrace a longer chain (every point within `tolerance` of it):
 * leftovers of the tracer that would make the pen draw the same line twice.
 */
export function dropRedundantChains(chains: Polyline[], tolerance: number): Polyline[] {
  const order = chains
    .map((c, index) => ({ c, index, length: polylineLength(c) }))
    .sort((a, b) => b.length - a.length);
  const cell = Math.max(tolerance, 0.5);
  const grid = new Map<string, Point[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  const covered = (p: Point) => {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const q of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (dist(p, q) <= tolerance) return true;
        }
      }
    }
    return false;
  };
  const kept = new Set<number>();
  for (const { c, index } of order) {
    if (kept.size && c.every(covered)) continue;
    kept.add(index);
    for (const p of c) {
      const k = key(p.x, p.y);
      const bucket = grid.get(k);
      if (bucket) bucket.push(p);
      else grid.set(k, [p]);
    }
  }
  return chains.filter((_, i) => kept.has(i));
}
