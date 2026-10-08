import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateGcode } from '../lib/gcode/validate';
import { DEFAULT_PLOTTER_SETTINGS, planPlot, rulesFor, sketchToGcode } from '../lib/sketch/export';
import { FONTS, layoutText, type TextLayoutOptions } from '../lib/text/layout';

const S = DEFAULT_PLOTTER_SETTINGS;
const AREA = {
  widthMm: S.paperWidthMm - 2 * S.marginMm,
  heightMm: S.paperHeightMm - 2 * S.marginMm,
};
const opts = (o: Partial<TextLayoutOptions> = {}): TextLayoutOptions => ({
  font: 'cursive',
  letterHeightMm: 'fit',
  lineSpacing: 1.15,
  align: 'left',
  natural: true,
  ...o,
});
const bbox = (pts: { x: number; y: number }[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

test('X1: every pen-down point of laid-out text stays inside the margin', () => {
  const cases: [string, Partial<TextLayoutOptions>][] = [
    ['textm hello', {}],
    ['affluent fluffy giraffes '.repeat(12), { letterHeightMm: 9 }],
    ['ÅÄÖ Éé jump fly', {}],
    ['ÅÄÖ Éé jump fly\nsecond line', { align: 'center', letterHeightMm: 14 }],
  ];
  for (const font of FONTS.map((f) => f.id)) {
    for (const [text, o] of cases) {
      const sketch = layoutText(text, AREA, opts({ font, ...o })).sketch;
      const out = validateGcode(sketchToGcode(sketch, S), rulesFor(S)).filter(
        (i) => i.invariant === 5
      );
      const b = bbox(planPlot(sketch, S).strokes.flat());
      if (out.length)
        console.log(
          `  ${font} ${JSON.stringify(text.slice(0, 20))}: ${out.length} outside, bbox ${JSON.stringify(b)}`
        );
      assert.equal(
        out.length,
        0,
        `${font} ${JSON.stringify(text.slice(0, 20))}: ${out[0]?.message}`
      );
    }
  }
});
