import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { countByInvariant, validateGcode } from '../lib/gcode/validate';
import { A4_RULES } from './helpers/rules';

const GOOD = `; ok
G21
G90
G92 X0 Y0
G0 Z5.00
G0 X20.00 Y20.00
G1 Z0.00 F500
G1 X40.00 Y20.00 F1500
G1 X40.00 Y40.00
G0 Z5.00
G0 X0.00 Y0.00
M2
`;

const issuesOf = (gcode: string) => countByInvariant(validateGcode(gcode, A4_RULES));

describe('validator unit cases', () => {
  test('a minimal correct file passes', () => {
    assert.deepEqual(validateGcode(GOOD, A4_RULES), []);
  });
  test('1: F on G0', () => assert.equal(issuesOf(GOOD.replace('G0 X20.00 Y20.00', 'G0 X20.00 Y20.00 F3000'))[1], 1));
  test('1: pen-down without F', () => assert.ok(issuesOf(GOOD.replace('G1 Z0.00 F500', 'G1 Z0.00'))[1] >= 1));
  test('1: drawing move inherits the pen feed', () =>
    assert.equal(issuesOf(GOOD.replace('G1 X40.00 Y20.00 F1500', 'G1 X40.00 Y20.00'))[1], 2));
  test('2: rapid while pen down', () => assert.equal(issuesOf(GOOD.replace('G1 X40.00 Y40.00', 'G0 X40.00 Y40.00'))[2], 1));
  test('3: missing start position', () => assert.equal(issuesOf(GOOD.replace('G92 X0 Y0\n', ''))[3], 1));
  test('4: missing M2', () => assert.ok(issuesOf(GOOD.replace('M2\n', ''))[4] >= 1));
  test('4: wrong park', () => assert.equal(issuesOf(GOOD.replace('G0 X0.00 Y0.00', 'G0 X210.00 Y297.00'))[4], 1));
  test('5: outside margin', () => assert.equal(issuesOf(GOOD.replace('G1 X40.00 Y40.00', 'G1 X40.00 Y287.40'))[5], 1));
  test('6: rounding, -0, duplicates, zero length', () => {
    assert.equal(issuesOf(GOOD.replace('X40.00 Y40.00', 'X40.0 Y40.00'))[6], 1);
    assert.equal(issuesOf(GOOD.replace('G0 X0.00 Y0.00', 'G0 X-0.00 Y0.00'))[6], 1);
    assert.equal(issuesOf(GOOD.replace('G1 X40.00 Y40.00', 'G1 X40.00 Y20.00'))[6], 1);
    assert.ok(issuesOf(GOOD.replace('G1 X40.00 Y20.00 F1500\nG1 X40.00 Y40.00\n', ''))[6] >= 1);
  });
  test('8: coarse curve fails, fine curve and straight lines pass', () => {
    const arc = (steps: number) => {
      const pts = Array.from({ length: steps + 1 }, (_, i) => {
        const a = (i / steps) * Math.PI;
        return `G1 X${(100 + 50 * Math.cos(a)).toFixed(2)} Y${(100 + 50 * Math.sin(a)).toFixed(2)}${i === 1 ? ' F1500' : ''}`;
      });
      return `G21\nG90\nG92 X0 Y0\nG0 Z5.00\nG0 X150.00 Y100.00\nG1 Z0.00 F500\n${pts.slice(1).join('\n')}\nG0 Z5.00\nG0 X0.00 Y0.00\nM2\n`;
    };
    assert.equal(issuesOf(arc(12))[8], 1); // 13 mm chords
    assert.equal(issuesOf(arc(400))[8], undefined); // 0.39 mm chords
  });
});

describe('baseline fixtures (pre-fix output) fail validation', () => {
  for (const name of ['textm', 'flower', 'snoop']) {
    test(name, () => {
      const gcode = readFileSync(join(__dirname, 'fixtures', `${name}.gcode`), 'utf8');
      const counts = issuesOf(gcode);
      console.log(`  ${name}.gcode issues by invariant: ${JSON.stringify(counts)}`);
      assert.ok(counts[1] > 0, 'F on G0 / pen-down feed');
      assert.ok(counts[3] > 0, 'header start position');
      assert.ok(counts[4] > 0, 'footer');
    });
  }
});
