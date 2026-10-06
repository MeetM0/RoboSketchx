/**
 * G-code validator. Checks the plotter invariants on finished G-code text (and, for
 * invariant 12, on drawings with declared attachments). Every problem is reported; nothing
 * is fixed here — the app blocks export / sending while any error remains.
 *
 * Invariants checked:
 *  1. No F on G0. Pen-down Z moves are G1 with an explicit F. Drawing moves run at a feed
 *     set explicitly for drawing (not inherited from the pen-down move).
 *  2. No rapid (G0) XY motion while the pen is down.
 *  3. Header declares units (G21), absolute mode (G90) and the start position (G92 / G28 / $H)
 *     before the first motion.
 *  4. Footer is: pen up → park at the configured position → M2.
 *  5. Every pen-down point lies within [margin, paper − margin] in X and Y.
 *  6. Numbers: X/Y/Z with exactly 2 decimals, no NaN/Infinity/-0.00, no duplicate
 *     consecutive pen-down points, no zero-length strokes.
 *  8. Curves are sampled by tolerance: at every smooth vertex (turn < 45°) the adjacent
 *     segments are ≤ maxChordMm or their sagitta is ≤ maxSagittaMm.
 * 12. Attached parts start (and end) on their parent stroke (gap ≤ maxAttachGapMm).
 */

export type PenRules =
  | { mode: 'z'; upZ: number; downZ: number }
  | { mode: 'custom'; upCommand: string; downCommand: string };

export type ValidationRules = {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  park: { x: number; y: number };
  pen: PenRules;
  maxChordMm: number;
  maxSagittaMm: number;
};

export const DEFAULT_SAMPLING = { maxChordMm: 0.5, maxSagittaMm: 0.05 };
export const MAX_ATTACH_GAP_MM = 0.2;

export type GcodeIssue = { invariant: number; line: number; message: string };

type Point = { x: number; y: number };

const NUMBER_2DP = /^-?\d+\.\d{2}$/;

export function validateGcode(gcode: string, rules: ValidationRules): GcodeIssue[] {
  const issues: GcodeIssue[] = [];
  const add = (invariant: number, line: number, message: string) =>
    issues.push({ invariant, line, message });

  const lo = rules.marginMm;
  const hiX = rules.paperWidthMm - rules.marginMm;
  const hiY = rules.paperHeightMm - rules.marginMm;

  let feed: number | null = null;
  // Where the current feed came from: a drawing move or a pen (Z) move.
  let feedSetBy: 'draw' | 'pen' | null = null;
  let units = false;
  let absolute = false;
  let start = false;
  let moved = false;
  let penDown = false;
  let pos: Point = { x: NaN, y: NaN };
  let stroke: Point[] = [];
  let strokeStartLine = 0;
  const motions: { line: number; text: string }[] = [];

  const finishStroke = () => {
    if (!penDown) return;
    let length = 0;
    for (let i = 1; i < stroke.length; i++) length += dist(stroke[i - 1], stroke[i]);
    if (length === 0) add(6, strokeStartLine, 'zero-length stroke (pen down and up on one spot)');
    checkSampling(stroke, strokeStartLine, rules, add);
  };

  const lines = gcode.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const n = index + 1;
    const line = raw
      .replace(/;.*$/, '')
      .replace(/\(.*?\)/g, '')
      .trim();
    if (!line) return;
    const upper = line.toUpperCase();
    if (/^G21\b/.test(upper)) units = true;
    if (/^G90\b/.test(upper)) absolute = true;
    if (/^(G92|G28)\b/.test(upper) || upper === '$H') start = true;
    if (/^G20\b/.test(upper)) add(3, n, 'inches (G20) are not allowed');
    if (/^G91\b/.test(upper)) add(3, n, 'relative mode (G91) is not allowed');

    // Pen state changes.
    let penChange: 'up' | 'down' | null = null;
    if (rules.pen.mode === 'custom') {
      if (line === rules.pen.downCommand) penChange = 'down';
      else if (line === rules.pen.upCommand) penChange = 'up';
    }

    const word = (letter: string) => {
      const m = upper.match(new RegExp(`(?:^|\\s)${letter}(\\S+)`));
      return m ? m[1] : null;
    };
    const g = word('G');
    const f = word('F');
    const xs = word('X');
    const ys = word('Y');
    const zs = word('Z');
    const isMotion = g === '0' || g === '00' || g === '1' || g === '01';

    for (const [letter, value] of [
      ['X', xs],
      ['Y', ys],
      ['Z', zs],
    ] as const) {
      // Coordinate formatting applies to motion; G92 etc. may use plain integers.
      if (value === null || !isMotion) continue;
      if (!Number.isFinite(Number(value))) add(6, n, `${letter} is not a finite number: ${value}`);
      else if (!NUMBER_2DP.test(value)) add(6, n, `${letter}${value} is not rounded to 2 decimals`);
      if (value === '-0.00' || value === '-0') add(6, n, `${letter} is negative zero`);
    }
    if (f !== null && !(Number(f) > 0)) add(1, n, `invalid feed F${f}`);

    if (isMotion && (g === '0' || g === '00') && f !== null) add(1, n, 'F on a G0 rapid move');

    if (isMotion) {
      if (!moved) {
        moved = true;
        if (!units) add(3, n, 'motion before G21 (units)');
        if (!absolute) add(3, n, 'motion before G90 (absolute mode)');
        if (!start) add(3, n, 'motion before a start position (G92 / G28 / $H)');
      }
      motions.push({ line: n, text: line });
    }
    if (rules.pen.mode === 'z' && isMotion && zs !== null) {
      const z = Number(zs);
      const mid = (rules.pen.upZ + rules.pen.downZ) / 2;
      const isDown = rules.pen.downZ < rules.pen.upZ ? z <= mid : z >= mid;
      penChange = isDown ? 'down' : 'up';
      if (isDown && (g === '0' || g === '00')) add(2, n, 'pen lowered with a rapid G0');
      if (isDown && g !== '0' && g !== '00' && f === null)
        add(1, n, 'pen-down G1 Z without an explicit F');
    }
    if (rules.pen.mode === 'custom' && penChange) motions.push({ line: n, text: line });

    if (f !== null) {
      feed = Number(f);
      feedSetBy = penChange ? 'pen' : 'draw';
    }

    if (penChange === 'down' && !penDown) {
      penDown = true;
      stroke = [pos];
      strokeStartLine = n;
      checkBounds(pos, n);
    } else if (penChange === 'up' && penDown) {
      finishStroke();
      penDown = false;
    }

    if (isMotion && (xs !== null || ys !== null)) {
      const next = { x: xs !== null ? Number(xs) : pos.x, y: ys !== null ? Number(ys) : pos.y };
      if (penDown) {
        if (g === '0' || g === '00') add(2, n, 'rapid G0 XY move while the pen is down');
        else if (feed === null) add(1, n, 'drawing move with no feed rate set');
        else if (feedSetBy === 'pen' && f === null)
          add(1, n, `drawing move runs at the pen feed F${feed} (no F set for drawing)`);
        if (next.x === pos.x && next.y === pos.y) add(6, n, 'duplicate consecutive point');
        checkBounds(next, n);
        stroke.push(next);
      }
      pos = next;
    }
  });
  if (penDown) {
    finishStroke();
    add(4, lines.length, 'file ends with the pen down');
  }

  // Footer: last three commands must be pen up, park move, M2.
  const commands = lines
    .map((raw, i) => ({ n: i + 1, text: raw.replace(/;.*$/, '').trim() }))
    .filter((l) => l.text);
  const [penUp, park, end] = commands.slice(-3);
  if (!end || !/^M2\b/i.test(end.text)) add(4, end?.n ?? lines.length, 'file does not end with M2');
  const parkMatch = park?.text.match(/^G0\s+X(\S+)\s+Y(\S+)$/i);
  if (!parkMatch) add(4, park?.n ?? 0, 'second-to-last command is not a G0 park move');
  else if (Number(parkMatch[1]) !== rules.park.x || Number(parkMatch[2]) !== rules.park.y)
    add(
      4,
      park.n,
      `park at X${parkMatch[1]} Y${parkMatch[2]}, configured X${rules.park.x} Y${rules.park.y}`
    );
  const isPenUp =
    rules.pen.mode === 'custom'
      ? penUp?.text === rules.pen.upCommand
      : !!penUp && /^G0?0?\s+Z/i.test(penUp.text) && isUpZ(penUp.text, rules.pen);
  if (!isPenUp) add(4, penUp?.n ?? 0, 'pen is not lifted before parking');

  return issues;

  function checkBounds(p: Point, n: number) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      add(5, n, 'pen down at an unknown position');
      return;
    }
    const over = Math.max(lo - p.x, p.x - hiX, lo - p.y, p.y - hiY);
    if (over > 1e-9)
      add(5, n, `pen-down point X${p.x} Y${p.y} is ${round(over)} mm outside the margin`);
  }
}

function isUpZ(text: string, pen: Extract<PenRules, { mode: 'z' }>) {
  const z = Number(text.toUpperCase().match(/Z(\S+)/)?.[1]);
  const mid = (pen.upZ + pen.downZ) / 2;
  return pen.downZ < pen.upZ ? z > mid : z < mid;
}

function checkSampling(
  stroke: Point[],
  line: number,
  rules: ValidationRules,
  add: (invariant: number, line: number, message: string) => void
) {
  let worst = 0;
  for (let i = 1; i + 1 < stroke.length; i++) {
    const a = stroke[i - 1];
    const b = stroke[i];
    const c = stroke[i + 1];
    const turn = Math.abs(angleBetween(a, b, c));
    // Sharp corners (≥ 45°) and straight runs are not curves.
    if (turn < 1e-6 || turn >= Math.PI / 4) continue;
    for (const length of [dist(a, b), dist(b, c)]) {
      if (length <= rules.maxChordMm) continue;
      // Sagitta of a chord of this length on the circle implied by the turn angle.
      const sagitta = (length / 2) * Math.tan(turn / 4);
      if (sagitta > rules.maxSagittaMm) worst = Math.max(worst, sagitta);
    }
  }
  if (worst > 0)
    add(
      8,
      line,
      `curve under-sampled: sagitta ${round(worst)} mm > ${rules.maxSagittaMm} mm on chords > ${rules.maxChordMm} mm`
    );
}

/**
 * Invariant 12: every attached part's first (and, if `bothEnds`, last) point lies on its parent
 * stroke. Strokes in millimetres.
 */
export function validateAttachments(
  strokes: Point[][],
  attachments: { child: number; parent: number; bothEnds?: boolean; name?: string }[],
  maxGapMm = MAX_ATTACH_GAP_MM
): GcodeIssue[] {
  const issues: GcodeIssue[] = [];
  for (const a of attachments) {
    const child = strokes[a.child];
    const parent = strokes[a.parent];
    if (!child || !parent) {
      issues.push({
        invariant: 12,
        line: 0,
        message: `attachment ${a.name ?? a.child} refers to a missing stroke`,
      });
      continue;
    }
    const ends = a.bothEnds ? [child[0], child[child.length - 1]] : [child[0]];
    for (const p of ends) {
      const gap = distanceToPolyline(p, parent);
      if (gap > maxGapMm)
        issues.push({
          invariant: 12,
          line: 0,
          message: `${a.name ?? `stroke ${a.child}`} is ${round(gap)} mm from its parent (max ${maxGapMm} mm)`,
        });
    }
  }
  return issues;
}

export function distanceToPolyline(p: Point, line: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++)
    best = Math.min(best, distanceToSegment(p, line[i - 1], line[i]));
  return line.length === 1 ? dist(p, line[0]) : best;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function angleBetween(a: Point, b: Point, c: Point) {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x);
  const a2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = a2 - a1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Issue counts per invariant, e.g. `{ 1: 26, 4: 1 }`. */
export function countByInvariant(issues: GcodeIssue[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const i of issues) out[i.invariant] = (out[i.invariant] ?? 0) + 1;
  return out;
}
