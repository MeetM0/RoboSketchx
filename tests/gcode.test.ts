import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countByInvariant, validateGcode } from '../lib/gcode/validate';
import { DEFAULT_PLOTTER_SETTINGS, rulesFor, sketchToGcode } from '../lib/sketch/export';
import type { Sketch } from '../lib/sketch/types';

// Two straight strokes (no curves), well inside the page once fitted.
const SKETCH: Sketch = {
  width: 100,
  height: 100,
  strokes: [
    [
      { x: 10, y: 10 },
      { x: 90, y: 10 },
      { x: 90, y: 90 },
    ],
    [
      { x: 10, y: 90 },
      { x: 10, y: 30 },
    ],
  ],
};

const run = (settings = DEFAULT_PLOTTER_SETTINGS) => {
  const gcode = sketchToGcode(SKETCH, settings);
  return { gcode, counts: countByInvariant(validateGcode(gcode, rulesFor(settings))) };
};

test('G1: no F on G0; pen-down G1 Z has the pen feed; drawing sets its own feed', () => {
  const { gcode, counts } = run();
  const lines = gcode.split('\n');
  const g0WithF = lines.filter((l) => /^G0\b.*F/.test(l)).length;
  const penDowns = lines.filter((l) => /^G1 Z/.test(l));
  console.log(`  G0 with F: ${g0WithF}; pen-down lines: ${JSON.stringify([...new Set(penDowns)])}`);
  assert.equal(g0WithF, 0);
  assert.deepEqual([...new Set(penDowns)], ['G1 Z0.00 F500']);
  // The move after every pen-down sets the drawing feed explicitly.
  lines.forEach((l, i) => {
    if (/^G1 Z/.test(l)) assert.match(lines[i + 1], /^G1 X\S+ Y\S+ F1500$/);
  });
  assert.equal(counts[1], undefined, `invariant 1 issues: ${counts[1]}`);
});

test('G1: custom pen commands (servo) are emitted verbatim', () => {
  const settings = {
    ...DEFAULT_PLOTTER_SETTINGS,
    penMode: 'custom' as const,
    penUpCommand: 'M3 S30',
    penDownCommand: 'M3 S90',
  };
  const { gcode, counts } = run(settings);
  assert.ok(gcode.includes('\nM3 S90\nG1 X'));
  assert.equal(counts[1], undefined);
});
