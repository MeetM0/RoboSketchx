import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as sk from '../lib/sketch';
import * as geometry from '../lib/sketch/geometry';
import type { Polyline } from '../lib/sketch/types';
import { diskScene } from './helpers/scenes';

const line = (x0: number, y0: number, x1: number, y1: number, n = 10): Polyline =>
  Array.from({ length: n + 1 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / n,
    y: y0 + ((y1 - y0) * i) / n,
  }));
const link = (chains: Polyline[]) => {
  const fn = (
    geometry as unknown as {
      linkChains?: (c: Polyline[], gap: number, angle: number) => Polyline[];
    }
  ).linkChains;
  assert.equal(typeof fn, 'function', 'linkChains() exists');
  return fn!(chains, 2.5, 45);
};

test('P5: endpoints within 2.5 px continuing the same direction are linked', () => {
  assert.equal(link([line(0, 0, 20, 0), line(22, 0, 40, 0)]).length, 1); // 2 px collinear gap
  assert.equal(link([line(0, 0, 20, 0), line(40, 0, 22, 0)]).length, 1); // reversed second chain
  assert.equal(link([line(0, 0, 20, 0), line(20, 2, 20, 20)]).length, 2); // perpendicular: not linked
  assert.equal(link([line(0, 0, 20, 0), line(24, 0, 40, 0)]).length, 2); // 4 px: too far
});

test('P5: a chain whose ends meet is closed (first point == last point)', () => {
  // Radius 30, last point 2 px (arc length) short of the start.
  const end = 2 * Math.PI - 2 / 30;
  const arc: Polyline = Array.from({ length: 95 }, (_, i) => {
    const a = (i / 94) * end;
    return { x: 50 + 30 * Math.cos(a), y: 50 + 30 * Math.sin(a) };
  });
  const gap = Math.hypot(arc[0].x - arc[94].x, arc[0].y - arc[94].y);
  assert.ok(gap > 1.9 && gap < 2.1, `gap ${gap}`);
  const [closed] = link([arc]);
  assert.deepEqual(closed[closed.length - 1], closed[0]);
});

test('P5: the disk outline is one closed loop with no stray fragments', () => {
  const sketch = sk.imageToSketch(diskScene(), sk.DETAIL_PRESETS.medium);
  const gaps = sketch.strokes.map((s) =>
    Math.hypot(s[0].x - s[s.length - 1].x, s[0].y - s[s.length - 1].y)
  );
  console.log(
    `  disk: ${sketch.strokes.length} stroke(s), points ${sketch.strokes.map((s) => s.length)}, first-last gaps ${gaps.map((g) => g.toFixed(2))} px`
  );
  assert.equal(sketch.strokes.length, 1);
  assert.equal(gaps[0], 0);
});
