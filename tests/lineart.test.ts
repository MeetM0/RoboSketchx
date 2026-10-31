import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Polyline } from '../lib/geometry/types';
import * as plot from '../lib/plot';
import * as sk from '../lib/sources/photo';
import * as chains from '../lib/sources/photo/chains';
import { traceEdges } from '../lib/sources/photo/trace';
import { CARTOON, diskScene, inkedCartoon, snoopScene } from './helpers/scenes';

const S = plot.DEFAULT_PLOTTER_SETTINGS;
const run = (image: ReturnType<typeof inkedCartoon>) =>
  sk.photoToSketch(image, { detail: 'medium', removeBackground: true, settings: S });

/** Stroke points mapped back to the input frame's pixels (undoing crop + resize). */
function framePoints(result: ReturnType<typeof run>) {
  const { crop, traced } = result;
  const k = crop.width / traced.width;
  return result.sketch.strokes.map((s) =>
    s.map((p) => ({ x: crop.x + p.x * k, y: crop.y + p.y * k }))
  );
}
const length = (line: { x: number; y: number }[]) =>
  line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - line[i].x, p.y - line[i].y), 0);

test('P4: a thick black outline is drawn once, along its middle (not as two edges)', () => {
  const result = run(inkedCartoon());
  const { cx, cy, r } = CARTOON;
  // Keep only the parts of strokes near the outline (the chord is inside, away from it).
  const near = framePoints(result).flatMap((s) => {
    const parts: { x: number; y: number }[][] = [[]];
    for (const p of s) {
      if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) < 12) parts.at(-1)!.push(p);
      else if (parts.at(-1)!.length) parts.push([]);
    }
    return parts.filter((part) => part.length > 1);
  });
  const drawn = near.reduce((sum, s) => sum + length(s), 0);
  const offsets = near.flat().map((p) => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r));
  offsets.sort((a, b) => a - b);
  const median = offsets[Math.floor(offsets.length / 2)];
  const circumference = 2 * Math.PI * r;
  console.log(
    `  outline drawn ${drawn.toFixed(0)} px for a ${circumference.toFixed(0)} px circle; median offset from its centre line ${median.toFixed(2)} px; trace = ${(result as { trace?: string }).trace}`
  );
  assert.ok(drawn > 0.9 * circumference && drawn < 1.1 * circumference, 'drawn once around');
  assert.ok(median <= 1.5, 'along the middle of the 9 px line');
});

test('P4: auto mode traces line drawings as lines and keeps edges for photos', () => {
  const traceOf = (image: ReturnType<typeof inkedCartoon>) =>
    (run(image) as { trace?: string }).trace;
  assert.equal(traceOf(inkedCartoon()), 'lines');
  assert.equal(traceOf(snoopScene()), 'edges');
  assert.equal(traceOf(diskScene()), 'edges');
});

test('P4: coloured fills and their darker shading are not taken as ink', () => {
  const image = inkedCartoon();
  const ink = sk.inkMask(image);
  const { cx, cy, r, outline } = CARTOON;
  let shading = 0;
  let shadingAsInk = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      // Well inside the dark-red band, away from the outline and the chord.
      if (x - cx > 70 && d < r - outline - 4 && Math.abs(y - cy) > 30) {
        shading++;
        shadingAsInk += ink[y * image.width + x];
      }
    }
  }
  assert.ok(shading > 1000);
  assert.equal(shadingAsInk, 0);
});

test('P5: a shallow staircase line joined to lines at both ends is traced as one chain', () => {
  // Two vertical lines with free ends (traced first, straight through the junctions), joined
  // partway down by a staircase falling to the left in 3-pixel steps. The staircase has no
  // free end, so the tracer must start mid-line and walk both ways, not one step per chain.
  const width = 40;
  const height = 24;
  const skeleton = new Uint8Array(width * height);
  const set = (x: number, y: number) => (skeleton[y * width + x] = 1);
  for (let y = 0; y <= 20; y++) set(33, y); // right line, joined by the top step (32, 5)
  for (let y = 6; y <= 20; y++) set(2, y); // left line, joined by the lowest step (3, 14)
  const stairs: { x: number; y: number }[] = [];
  for (let step = 0; step < 10; step++) {
    for (let k = 0; k < 3; k++) stairs.push({ x: 32 - 3 * step - k, y: 5 + step });
  }
  for (const p of stairs) set(p.x, p.y);
  const traced = traceEdges(skeleton, width, height);
  const covering = traced.filter((c) =>
    c.some((p) => stairs.some((q) => q.x === p.x && q.y === p.y))
  );
  console.log(`  staircase (${stairs.length} px) traced as ${covering.length} chain(s)`);
  assert.equal(covering.length, 1);
  assert.equal(covering[0].length >= stairs.length, true);
});

test('P5: chain ends that touch diagonally are linked (exact 45° step)', () => {
  const line = (x0: number, y: number, x1: number): Polyline =>
    Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));
  const linked = chains.linkChains([line(0, 0, 5), line(6, 1, 11)], 2.5, 45);
  assert.equal(linked.length, 1);
});
