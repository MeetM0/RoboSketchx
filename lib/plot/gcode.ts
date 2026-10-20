import type { Point, Sketch } from '../geometry/types';
import { planPlot } from './plan';
import type { PlotterSettings } from './settings';
import { DEFAULT_SAMPLING, type ValidationRules } from './validate';

const round = (n: number) => Math.round(n * 100) / 100;

/** Fixed 2-decimal number without negative zero. */
const num = (n: number) => {
  const text = round(n).toFixed(2);
  return text === '-0.00' ? '0.00' : text;
};

const START_LINES: Record<PlotterSettings['startMode'], string> = {
  g92: 'G92 X0 Y0 ; pen is at X0 Y0 (paper bottom-left)',
  g28: 'G28 ; go to reference position',
  home: '$H ; homing cycle',
};

export const penUpLine = (s: PlotterSettings) =>
  s.penMode === 'z' ? `G0 Z${num(s.penUpZ)}` : s.penUpCommand;
export const penDownLine = (s: PlotterSettings) =>
  s.penMode === 'z' ? `G1 Z${num(s.penDownZ)} F${s.penFeedRate}` : s.penDownCommand;

/** Validation rules matching these settings (see ./validate.ts). */
export function rulesFor(settings: PlotterSettings): ValidationRules {
  return {
    paperWidthMm: settings.paperWidthMm,
    paperHeightMm: settings.paperHeightMm,
    marginMm: settings.marginMm,
    park: { x: settings.parkXMm, y: settings.parkYMm },
    pen:
      settings.penMode === 'z'
        ? { mode: 'z', upZ: settings.penUpZ, downZ: settings.penDownZ }
        : {
            mode: 'custom',
            upCommand: settings.penUpCommand,
            downCommand: settings.penDownCommand,
          },
    ...DEFAULT_SAMPLING,
  };
}

/** The G-code program for the sketch: header, one pen-down run per stroke, park, end. */
export function sketchToGcode(sketch: Sketch, settings: PlotterSettings): string {
  const plan = planPlot(sketch, settings);
  const fmt = (p: Point) => `X${num(p.x)} Y${num(p.y)}`;
  const lines = [
    '; RoboSketch',
    `; paper ${settings.paperWidthMm}x${settings.paperHeightMm}mm, margin ${settings.marginMm}mm, ${plan.strokeCount} strokes`,
    'G21 ; millimetres',
    'G90 ; absolute positioning',
    START_LINES[settings.startMode],
    penUpLine(settings),
  ];
  for (const stroke of plan.strokes) {
    const [first, ...rest] = stroke;
    // Rapids never carry F (F is modal and would leak into the next G1).
    lines.push(`G0 ${fmt(first)}`);
    lines.push(penDownLine(settings));
    // F is modal: set the drawing feed on the first move after the pen-down feed.
    rest.forEach((p, i) =>
      lines.push(`G1 ${fmt(p)}${i === 0 ? ` F${settings.drawFeedRate}` : ''}`)
    );
    lines.push(penUpLine(settings));
  }
  lines.push(`G0 ${fmt(plan.park)}`);
  lines.push('M2 ; end of program', '');
  return lines.join('\n');
}
