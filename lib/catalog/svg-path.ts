import type { Point, Polyline } from '../sketch/types';

/**
 * Converts SVG path data into pen strokes (polylines). Supports every path command
 * (M L H V C S Q T A Z, absolute and relative); curves and arcs are flattened into short
 * line segments no more than `tolerance` units away from the true curve.
 */
export function flattenPath(d: string, tolerance = 0.1): Polyline[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const strokes: Polyline[] = [];
  let stroke: Polyline | null = null;
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  // Last control point, for the smooth-curve shorthands S and T.
  let lastCubic: Point | null = null;
  let lastQuad: Point | null = null;
  let command = '';
  let i = 0;

  const number = () => {
    const token = tokens[i++];
    if (token === undefined || /[a-zA-Z]/.test(token)) throw new Error(`Bad path data: ${d}`);
    return Number(token);
  };
  const lineTo = (p: Point) => {
    if (!stroke) {
      stroke = [current];
      strokes.push(stroke);
    }
    stroke.push(p);
    current = p;
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    else if (!command) throw new Error(`Bad path data: ${d}`);
    const relative = command === command.toLowerCase();
    const at = (x: number, y: number): Point =>
      relative ? { x: current.x + x, y: current.y + y } : { x, y };
    const upper = command.toUpperCase();
    let nextCubic: Point | null = null;
    let nextQuad: Point | null = null;

    switch (upper) {
      case 'M': {
        current = at(number(), number());
        start = current;
        stroke = null;
        // Further coordinate pairs after a move are implicit line-tos.
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L':
        lineTo(at(number(), number()));
        break;
      case 'H': {
        const x = number();
        lineTo({ x: relative ? current.x + x : x, y: current.y });
        break;
      }
      case 'V': {
        const y = number();
        lineTo({ x: current.x, y: relative ? current.y + y : y });
        break;
      }
      case 'C':
      case 'S': {
        const c1: Point =
          upper === 'C'
            ? at(number(), number())
            : lastCubic
              ? { x: 2 * current.x - lastCubic.x, y: 2 * current.y - lastCubic.y }
              : current;
        const c2 = at(number(), number());
        const end = at(number(), number());
        const from = current;
        for (const p of sampleCurve((t) => cubic(from, c1, c2, end, t), tolerance)) lineTo(p);
        nextCubic = c2;
        break;
      }
      case 'Q':
      case 'T': {
        const c: Point =
          upper === 'Q'
            ? at(number(), number())
            : lastQuad
              ? { x: 2 * current.x - lastQuad.x, y: 2 * current.y - lastQuad.y }
              : current;
        const end = at(number(), number());
        const from = current;
        for (const p of sampleCurve((t) => quadratic(from, c, end, t), tolerance)) lineTo(p);
        nextQuad = c;
        break;
      }
      case 'A': {
        const rx = number();
        const ry = number();
        const rotation = number();
        const largeArc = number() !== 0;
        const sweep = number() !== 0;
        const end = at(number(), number());
        const arc = arcFunction(current, end, rx, ry, rotation, largeArc, sweep);
        if (arc) for (const p of sampleCurve(arc, tolerance)) lineTo(p);
        else lineTo(end);
        break;
      }
      case 'Z':
        if (stroke) lineTo(start);
        stroke = null;
        current = start;
        break;
      default:
        throw new Error(`Unsupported path command ${command}`);
    }
    lastCubic = nextCubic;
    lastQuad = nextQuad;
  }
  return strokes.filter((s) => s.length > 1);
}

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function quadratic(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/**
 * Samples t ∈ (0, 1] of a curve, recursively splitting until each chord is within
 * `tolerance` of the curve's midpoint.
 */
function sampleCurve(at: (t: number) => Point, tolerance: number): Point[] {
  const out: Point[] = [];
  const recurse = (t0: number, p0: Point, t1: number, p1: Point, depth: number) => {
    const tm = (t0 + t1) / 2;
    const pm = at(tm);
    const deviation = Math.hypot(pm.x - (p0.x + p1.x) / 2, pm.y - (p0.y + p1.y) / 2);
    // Always split a few times so S-shaped segments whose midpoint lies on the chord still bend.
    if (depth < 12 && (depth < 3 || deviation > tolerance)) {
      recurse(t0, p0, tm, pm, depth + 1);
      recurse(tm, pm, t1, p1, depth + 1);
    } else {
      out.push(p1);
    }
  };
  recurse(0, at(0), 1, at(1), 0);
  return out;
}

/** SVG elliptical arc (endpoint parameterisation) → point at t ∈ [0, 1]. Null if degenerate. */
function arcFunction(
  from: Point,
  to: Point,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean
): ((t: number) => Point) | null {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (!rx || !ry || (from.x === to.x && from.y === to.y)) return null;
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  // Step 1: transform into the ellipse's frame (SVG spec F.6.5).
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  // Scale radii up if they're too small to reach the end point.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  // Step 2: centre in the ellipse frame.
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) factor = -factor;
  const cx1 = (factor * rx * y1) / ry;
  const cy1 = (-factor * ry * x1) / rx;
  // Step 3: centre in user space and the start / sweep angles.
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  return (t) => {
    const theta = theta1 + delta * t;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    return { x: cos * ex - sin * ey + cx, y: sin * ex + cos * ey + cy };
  };
}
