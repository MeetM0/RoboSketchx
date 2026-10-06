import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as sk from '../lib/sketch';
import { snoopScene } from './helpers/scenes';

const S = sk.DEFAULT_PLOTTER_SETTINGS;
const USABLE = { w: S.paperWidthMm - 2 * S.marginMm, h: S.paperHeightMm - 2 * S.marginMm };
const r2 = (n: number) => Math.round(n * 100) / 100;
const bboxOf = (strokes: { x: number; y: number }[][]) => {
  const ps = strokes.flat();
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

/** The app's photo pipeline as it stands (decoded image in, sketch out). */
function photoSketch(image: sk.RgbaImage) {
  const run = (sk as unknown as { photoToSketch?: Function }).photoToSketch;
  if (run)
    return run(image, { detail: 'medium', removeBackground: true, settings: S })
      .sketch as sk.Sketch;
  const removal = sk.removeBackground(image);
  return sk.imageToSketch(
    removal.ok ? sk.applyMask(image, removal.mask) : image,
    sk.DETAIL_PRESETS.medium
  );
}

test('P2: the drawing (stroke bbox) is fitted and centred in the printable area', () => {
  const plan = sk.planPlot(photoSketch(snoopScene()), S);
  const b = bboxOf(plan.strokes);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const fill = Math.max(w / USABLE.w, h / USABLE.h);
  const centre = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  console.log(
    `  snoop on A4: bbox x ${r2(b.minX)}–${r2(b.maxX)}, y ${r2(b.minY)}–${r2(b.maxY)} (${r2(w)} × ${r2(h)} mm); fills ${r2(fill * 100)}% of the limiting side; centre ${r2(centre.x)}, ${r2(centre.y)}`
  );
  assert.ok(fill > 0.995, `drawing fills only ${r2(fill * 100)}% of the printable area`);
  assert.ok(
    Math.abs(centre.x - S.paperWidthMm / 2) < 0.5 && Math.abs(centre.y - S.paperHeightMm / 2) < 0.5,
    'centred'
  );
});
