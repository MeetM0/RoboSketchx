import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as sk from '../lib/sketch';
import { diskScene, downscale, snoopScene } from './helpers/scenes';

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

/**
 * The app's photo pipeline (decoded working image in, sketch out). Before photoToSketch
 * existed, the app resized the whole frame to 512 px and traced it.
 */
function photoSketch(image: sk.RgbaImage): sk.Sketch {
  const run = (sk as unknown as { photoToSketch?: Function }).photoToSketch;
  if (run) return run(image, { detail: 'medium', removeBackground: true, settings: S }).sketch;
  const longest = Math.max(image.width, image.height);
  const small = longest > 512 ? downscale(image, longest / 512) : image;
  const removal = sk.removeBackground(small);
  return sk.imageToSketch(
    removal.ok ? sk.applyMask(small, removal.mask) : small,
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

test('P1: the subject is cropped before resizing, so it gets the full 512 px', () => {
  // The app prepares photos at 1024 px; this is the same scene at 768 × 1024.
  const sketch = photoSketch(snoopScene(768, 1024));
  const b = bboxOf(sketch.strokes);
  const subjectPx = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const mmPerPx = sk.pixelToPaperTransform(sketch, S).scale;
  console.log(
    `  traced frame ${sketch.width}×${sketch.height} px; subject ${r2(b.maxX - b.minX)} × ${r2(b.maxY - b.minY)} px; ${r2(mmPerPx)} mm per traced px on A4`
  );
  assert.ok(subjectPx >= 440, `subject only ${r2(subjectPx)} px`);
  assert.ok(mmPerPx <= 0.45, `${r2(mmPerPx)} mm/px`);
});

/** Share of segments within ±1° of 0°, 45°, 90° or 135° — pixel staircase leftovers. */
function axisShare(strokes: { x: number; y: number }[][]) {
  let n = 0;
  let axis = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) {
      const a = (Math.atan2(s[i].y - s[i - 1].y, s[i].x - s[i - 1].x) * 180) / Math.PI;
      const m = ((a % 45) + 45) % 45;
      n++;
      if (m <= 1 || m >= 44) axis++;
    }
  }
  return { segments: n, axis, share: n ? axis / n : 0 };
}

test('P3: traced chains are smoothed before simplification (axis/45° share < 20%)', () => {
  const snoop = axisShare(photoSketch(snoopScene(768, 1024)).strokes);
  // Reported only: a perfect circle is mirror-symmetric about the axes and diagonals, so its
  // simplified chords land exactly on 0/45/90/135° where those tangents occur — geometry, not
  // pixel staircase.
  const disk = axisShare(photoSketch(diskScene()).strokes);
  console.log(
    `  snoop: ${snoop.axis}/${snoop.segments} segments axis-aligned or 45° = ${r2(snoop.share * 100)}%`
  );
  console.log(`  disk (reported only): ${disk.axis}/${disk.segments} = ${r2(disk.share * 100)}%`);
  assert.ok(snoop.share < 0.2, `snoop: ${r2(snoop.share * 100)}%`);
});

test('P6: thresholds are in mm, so resolution does not change the drawing', () => {
  const full = sk.resizeImage(snoopScene(768, 1024), 512);
  const half = downscale(full, 2);
  const runs = [full, half].map((image) => {
    const removal = sk.removeBackground(image);
    const input = removal.ok ? sk.applyMask(image, removal.mask) : image;
    // mm per traced pixel when this frame is fitted to A4's printable area.
    const mmPerPx = Math.min(USABLE.w / image.width, USABLE.h / image.height);
    const sketch = (
      sk.imageToSketch as (i: sk.RgbaImage, o: sk.SketchOptions, m?: number) => sk.Sketch
    )(input, sk.DETAIL_PRESETS.medium, mmPerPx);
    const plan = sk.planPlot({ ...sketch, fit: 'frame' }, S);
    return {
      px: `${image.width}×${image.height}`,
      mmPerPx,
      strokes: plan.strokeCount,
      lengthMm: plan.drawLengthMm,
    };
  });
  for (const r of runs)
    console.log(
      `  ${r.px}: ${r2(r.mmPerPx)} mm/px → ${r.strokes} strokes, ${r2(r.lengthMm)} mm pen-down`
    );
  const [a, b] = runs;
  assert.ok(
    Math.abs(a.strokes - b.strokes) / a.strokes <= 0.15,
    `strokes ${a.strokes} vs ${b.strokes}`
  );
  assert.ok(
    Math.abs(a.lengthMm - b.lengthMm) / a.lengthMm <= 0.1,
    `length ${r2(a.lengthMm)} vs ${r2(b.lengthMm)}`
  );
});

test('P6: every preset threshold is defined in mm and converted with the mm/px scale', () => {
  const resolve = (sk as unknown as { resolveThresholds?: Function }).resolveThresholds;
  assert.equal(typeof resolve, 'function', 'resolveThresholds() exists');
  for (const level of ['low', 'medium', 'high'] as const) {
    const preset = sk.DETAIL_PRESETS[level] as unknown as Record<string, number>;
    for (const mmPerPx of [0.25, 0.41, 0.99]) {
      const px = resolve!(sk.DETAIL_PRESETS[level], mmPerPx) as Record<string, number>;
      for (const name of ['minStrokeLength', 'simplifyTolerance', 'linkGap']) {
        const mm = px[`${name}Px`] * mmPerPx;
        if (name === 'linkGap' && px.linkGapPx === 1.5) continue; // floored at 1.5 px (see source)
        assert.ok(
          Math.abs(mm - preset[`${name}Mm`]) < 1e-9,
          `${level} ${name} at ${mmPerPx} mm/px = ${mm} mm`
        );
      }
    }
    console.log(
      `  ${level}: ${JSON.stringify(Object.fromEntries(Object.entries(preset).filter(([k]) => k.endsWith('Mm'))))}`
    );
  }
});
