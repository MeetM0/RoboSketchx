import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Polyline } from '../lib/geometry/types';
import * as plot from '../lib/plot';
import * as sk from '../lib/sources/photo';
import * as chains from '../lib/sources/photo/chains';
import { traceEdges } from '../lib/sources/photo/trace';
import {
  CARTOON,
  COLOURED,
  colouredLines,
  diskScene,
  DOODLE,
  FILLED,
  GREY_SUIT,
  greySuit,
  filledCartoon,
  inkedCartoon,
  lineArt,
  markerDoodle,
  snoopScene,
  texturedPhoto,
} from './helpers/scenes';

const S = plot.DEFAULT_PLOTTER_SETTINGS;
const run = (image: ReturnType<typeof inkedCartoon>, trace: sk.TraceMode = 'auto') =>
  sk.photoToSketch(image, { detail: 'medium', removeBackground: true, settings: S, trace });

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

for (const which of ['dot', 'smallDot'] as const) {
  test(`P4: a solid shape (${which === 'dot' ? 'an eye dot' : 'a small eye dot, thinner than the lines'}) is drawn as its outline`, () => {
    const result = run(inkedCartoon());
    const dot = CARTOON[which];
    const near = framePoints(result).flatMap((s) => {
      const parts: { x: number; y: number }[][] = [[]];
      for (const p of s) {
        if (Math.hypot(p.x - dot.x, p.y - dot.y) < dot.r + 6) parts.at(-1)!.push(p);
        else if (parts.at(-1)!.length) parts.push([]);
      }
      return parts.filter((part) => part.length > 1);
    });
    const drawn = near.reduce((sum, s) => sum + length(s), 0);
    const radii = near.flat().map((p) => Math.hypot(p.x - dot.x, p.y - dot.y));
    const meanRadius = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length);
    const perimeter = 2 * Math.PI * dot.r;
    console.log(
      `  ${which} drawn ${drawn.toFixed(0)} px (outline ${perimeter.toFixed(0)} px), mean radius ${meanRadius.toFixed(1)} px (dot ${dot.r} px)`
    );
    assert.ok(drawn > 0.7 * perimeter && drawn < 1.3 * perimeter, 'once around the dot');
    assert.ok(Math.abs(meanRadius - dot.r) <= 2, 'along its edge');
  });
}

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

test('P4: a light-coloured marker doodle is traced as lines, both separate rings once each', () => {
  const result = run(markerDoodle([240, 150, 40]));
  const { rings, cy, r } = DOODLE;
  const points = framePoints(result);
  const drawn = points.reduce((sum, s) => sum + length(s), 0);
  const expected = 2 * 2 * Math.PI * r + (512 - cy - r);
  console.log(
    `  drawn ${drawn.toFixed(0)} px of ${expected.toFixed(0)} px; trace = ${result.trace}`
  );
  assert.equal(result.trace, 'lines');
  for (const cx of rings) {
    const onRing = points.flat().filter((p) => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) < 4);
    assert.ok(onRing.length > 20, `ring at x = ${cx} is drawn`);
  }
  assert.ok(drawn > 0.85 * expected && drawn < 1.15 * expected, 'each line drawn once');
});

test('P4: a small mark near the picture edge (a watermark) is left out of a line drawing', () => {
  const result = run(markerDoodle([30, 60, 160], true));
  const { box } = DOODLE;
  const inBox = framePoints(result)
    .flat()
    .filter((p) => p.x > box.x0 - 3 && p.x < box.x1 + 3 && p.y > box.y0 - 3 && p.y < box.y1 + 3);
  assert.equal(result.trace, 'lines');
  assert.equal(inBox.length, 0, 'no strokes on the watermark');
});

/** Each stroke as points every ~1 px, in the input frame. */
function densified(result: ReturnType<typeof run>) {
  return framePoints(result).map((s) => [
    ...s.slice(1).flatMap((b, i) => {
      const a = s[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      return Array.from({ length: n }, (_, k) => ({
        x: a.x + ((b.x - a.x) * k) / n,
        y: a.y + ((b.y - a.y) * k) / n,
      }));
    }),
    s[s.length - 1],
  ]);
}
const samples = (result: ReturnType<typeof run>) => densified(result).flat();

test('P4: a long band much thicker than the lines (an eye band) is drawn by its outline', () => {
  // A 5 px square frame, and inside it a 32 px thick arc band (radius 110, upper half).
  const band = { cx: 256, cy: 300, r: 110, half: 16 };
  const inBand = (x: number, y: number) =>
    y <= band.cy && Math.abs(Math.hypot(x - band.cx, y - band.cy) - band.r) <= band.half;
  const frame = (x: number, y: number) =>
    (Math.abs(x - 60) <= 2.5 ||
      Math.abs(x - 452) <= 2.5 ||
      Math.abs(y - 60) <= 2.5 ||
      Math.abs(y - 452) <= 2.5) &&
    x >= 57 &&
    x <= 455 &&
    y >= 57 &&
    y <= 455;
  const result = run(lineArt(512, 512, (x, y) => frame(x, y) || inBand(x, y)));
  // Only the middle of the arc (well away from its rounded-off ends).
  const mid = samples(result).filter((p) => p.y < band.cy - 60 && Math.abs(p.x - band.cx) < 70);
  const near = (offset: number) =>
    mid.filter((p) => Math.abs(Math.hypot(p.x - band.cx, p.y - band.cy) - (band.r + offset)) < 3)
      .length;
  console.log(
    `  inner edge ${near(-band.half)}, centre ${near(0)}, outer edge ${near(band.half)} samples`
  );
  assert.equal(result.trace, 'lines');
  assert.ok(near(-band.half) > 100 && near(band.half) > 100, 'both edges of the band drawn');
  assert.equal(near(0), 0, 'not its centre line');
});

test('P4: a line running into a solid shape is joined to its outline (no gap)', () => {
  const dot = { x: 340, y: 256, r: 40 };
  const result = run(
    lineArt(
      512,
      512,
      (x, y) =>
        (x >= 100 && x <= dot.x && Math.abs(y - dot.y) <= 6) ||
        Math.hypot(x - dot.x, y - dot.y) <= dot.r ||
        (Math.abs(x - 60) <= 6 && y >= 100 && y <= 400)
    ),
    'lines'
  );
  // The stroke that draws the line must reach the dot's outline.
  const line = densified(result).find((s) =>
    s.some((p) => Math.abs(p.x - 200) < 3 && Math.abs(p.y - dot.y) < 3)
  );
  assert.ok(line, 'the line is drawn');
  const reach = Math.min(
    ...line.map((p) => Math.abs(Math.hypot(p.x - dot.x, p.y - dot.y) - dot.r))
  );
  console.log(`  the line's stroke comes within ${reach.toFixed(2)} px of the dot's outline`);
  assert.ok(reach <= 1.5, 'joined to the outline');
});

test('P4: a cartoon with large black fills is a line drawing, its fills drawn by their outline', () => {
  const result = run(filledCartoon());
  assert.equal(result.trace, 'lines', 'flat artwork, not a photo');
  const { block, navy, line } = FILLED;
  const points = samples(result);
  const nearEdge = (b: typeof block) =>
    points.filter((p) => {
      const dx = Math.min(Math.abs(p.x - b.x0), Math.abs(p.x - b.x1));
      const dy = Math.min(Math.abs(p.y - b.y0), Math.abs(p.y - b.y1));
      const inX = p.x > b.x0 + 4 && p.x < b.x1 - 4;
      const inY = p.y > b.y0 + 4 && p.y < b.y1 - 4;
      return (inX && dy < 3) || (inY && dx < 3);
    }).length;
  // Well inside the black (away from the navy patch): no centre lines.
  const interior = points.filter((p) => p.x > 290 && p.x < 380 && p.y > 300 && p.y < 375).length;
  const onLine = points.filter((p) => Math.abs(p.y - line.y) < 3).length;
  console.log(
    `  block edge ${nearEdge(block)}, navy edge ${nearEdge(navy)}, interior ${interior}, line ${onLine}`
  );
  assert.ok(nearEdge(block) > 0.8 * 2 * (300 + 200), 'the black block is outlined');
  assert.ok(nearEdge(navy) > 0.8 * 2 * (100 + 50), 'the navy patch inside it is outlined');
  assert.equal(interior, 0, 'no centre lines through the fill');
  assert.ok(
    onLine > 0.8 * (line.x1 - line.x0) && onLine < 1.2 * (line.x1 - line.x0),
    'the thin line drawn once'
  );
});

test('P5: thinning keeps a diagonal line two pixels wide (Zhang–Suen alone erases it)', () => {
  const width = 64;
  const height = 64;
  const mask = new Uint8Array(width * height);
  for (let k = 10; k < 50; k++) {
    mask[k * width + k] = 1;
    mask[k * width + k + 1] = 1;
  }
  const skeleton = sk.thin(mask, width, height);
  const kept = skeleton.reduce((sum, v) => sum + v, 0);
  console.log(`  ${kept} of 40 diagonal pixels kept`);
  assert.ok(kept >= 36, 'the diagonal survives as a line');
});

test('P4: an asterisk drawn with a thick pen is drawn as lines through its centre', () => {
  const c = { x: 256, y: 256, arm: 120, half: 4 };
  const arms = [0, 60, 120].map((deg) => (deg * Math.PI) / 180);
  const result = run(
    lineArt(512, 512, (x, y) =>
      arms.some((a) => {
        const along = (x - c.x) * Math.cos(a) + (y - c.y) * Math.sin(a);
        const across = -(x - c.x) * Math.sin(a) + (y - c.y) * Math.cos(a);
        return Math.abs(along) <= c.arm && Math.abs(across) <= c.half;
      })
    ),
    'lines'
  );
  const points = samples(result);
  const nearCentre = points.filter((p) => Math.hypot(p.x - c.x, p.y - c.y) < 6).length;
  const onArms = points.filter((p) =>
    arms.some((a) => Math.abs(-(p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a)) < 4)
  ).length;
  console.log(
    `  ${nearCentre} samples at the centre, ${onArms} of ${points.length} along the arms`
  );
  assert.ok(nearCentre > 0, 'the lines cross the centre');
  assert.ok(onArms > 0.9 * points.length, 'drawn along the arms, not around them');
});

test('P4: a textured photo with thin dark details is traced as a photo, not a line drawing', () => {
  const result = run(texturedPhoto());
  assert.equal(result.trace, 'edges');
});

test('P4: lines drawn in a colour (brown window bars, a blue halo) are traced too', () => {
  const result = run(colouredLines());
  const { cx, cy, frame, halo } = COLOURED;
  const points = samples(result);
  const onBars = points.filter(
    (p) =>
      p.x > frame.x0 + 20 &&
      p.x < frame.x1 - 20 &&
      p.y > frame.y0 + 20 &&
      p.y < frame.y1 - 20 &&
      (Math.abs(p.x - cx) < 3 || Math.abs(p.y - cy) < 3)
  ).length;
  const onHalo = points.filter(
    (p) => Math.abs(Math.hypot(p.x - cx, p.y - halo.cy) - halo.r) < 3
  ).length;
  const barsLength = 2 * (frame.x1 - frame.x0 - 40);
  console.log(
    `  bars ${onBars} of ~${barsLength} samples, halo ${onHalo}; trace = ${result.trace}`
  );
  assert.equal(result.trace, 'lines');
  assert.ok(onBars > 0.8 * barsLength, 'the brown cross is drawn along its middle');
  assert.ok(onHalo > 0.8 * 2 * Math.PI * halo.r, 'the blue halo is drawn');
});

test('P4: a dark grey shaded fill is not ink: only its black outline is drawn', () => {
  const result = run(greySuit());
  const { x0, y0, x1, y1, outline } = GREY_SUIT;
  const points = samples(result);
  const m = outline + 8;
  const inside = points.filter((p) => p.x > x0 + m && p.x < x1 - m && p.y > y0 + m && p.y < y1 - m);
  const perimeter = 2 * (x1 - x0 + (y1 - y0));
  console.log(
    `  ${inside.length} samples inside the fill, ${points.length} in all (outline ~${perimeter})`
  );
  assert.equal(result.trace, 'lines');
  assert.equal(inside.length, 0, 'no scribbles in the grey fill');
  assert.ok(points.length > 0.8 * perimeter, 'the outline is drawn');
});
