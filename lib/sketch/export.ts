import { DEFAULT_SAMPLING, type ValidationRules } from '../gcode/validate';
import { joinStrokes, polylineLength } from './geometry';
import type { Point, Polyline, Sketch } from './types';

export type PlotterSettings = {
  /** Drawable paper area in millimetres. */
  paperWidthMm: number;
  paperHeightMm: number;
  /** Blank border kept on every side, in millimetres. */
  marginMm: number;
  /** Drawing speed (mm/min) while the pen is down. */
  drawFeedRate: number;
  /**
   * Pen-up travel speed (mm/min), used only for time estimates: travel is emitted as G0
   * rapids, which run at the machine's own rapid rate.
   */
  travelFeedRate: number;
  /**
   * How the pen is lifted / lowered:
   * - `z`      — a Z axis: `G0 Z<up>` to lift, `G1 Z<down> F<penFeedRate>` to lower;
   * - `custom` — free-form commands (e.g. a servo's `M3 S..`), emitted verbatim.
   */
  penMode: 'z' | 'custom';
  penUpZ: number;
  penDownZ: number;
  /** Feed (mm/min) for lowering the pen in `z` mode. */
  penFeedRate: number;
  /** Commands used in `custom` pen mode. */
  penUpCommand: string;
  penDownCommand: string;
  /**
   * How the job establishes where the pen is before moving:
   * - `g92`  — `G92 X0 Y0`: the pen's current position becomes X0 Y0 (place it at the
   *   paper's bottom-left corner before starting);
   * - `g28`  — `G28`: return to the machine's reference position;
   * - `home` — `$H`: GRBL homing cycle (needs homing switches).
   */
  startMode: 'g92' | 'g28' | 'home';
  /** Where the pen parks when the job ends (machine coordinates, mm). */
  parkXMm: number;
  parkYMm: number;
};

export const DEFAULT_PLOTTER_SETTINGS: PlotterSettings = {
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginMm: 10,
  drawFeedRate: 1500,
  travelFeedRate: 3000,
  penMode: 'z',
  penUpZ: 5,
  penDownZ: 0,
  penFeedRate: 500,
  penUpCommand: 'M5',
  penDownCommand: 'M3 S90',
  startMode: 'g92',
  parkXMm: 0,
  parkYMm: 0,
};

/** Strokes whose ends are this close on paper are drawn as one, without lifting the pen. */
export const JOIN_GAP_MM = 0.3;

const round = (n: number) => Math.round(n * 100) / 100;

export function sketchToSvgPathData(sketch: Sketch): string {
  return sketch.strokes
    .map((s) => 'M' + s.map((p) => `${round(p.x)} ${round(p.y)}`).join(' L'))
    .join(' ');
}

export function sketchToSvg(sketch: Sketch): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sketch.width} ${sketch.height}" width="${sketch.width}" height="${sketch.height}">`,
    `<path d="${sketchToSvgPathData(sketch)}" fill="none" stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
    '',
  ].join('\n');
}

/**
 * Maps image pixels onto the paper (fit inside the margins, centred, aspect preserved).
 * Machine Y points up, so the image is flipped vertically.
 */
export function pixelToPaperTransform(sketch: Sketch, settings: PlotterSettings) {
  const usableW = settings.paperWidthMm - 2 * settings.marginMm;
  const usableH = settings.paperHeightMm - 2 * settings.marginMm;
  const scale = Math.min(usableW / sketch.width, usableH / sketch.height);
  const offsetX = settings.marginMm + (usableW - sketch.width * scale) / 2;
  const offsetY = settings.marginMm + (usableH - sketch.height * scale) / 2;
  return {
    scale,
    offsetX,
    offsetY,
    toPaper: (p: Point): Point => ({
      x: offsetX + p.x * scale,
      y: offsetY + (sketch.height - p.y) * scale,
    }),
  };
}

export type PlotPlan = {
  /** Pen-down strokes in paper millimetres (machine coordinates, y up), in drawing order. */
  strokes: Polyline[];
  /** Where the pen parks afterwards (the configured park position). */
  park: Point;
  strokeCount: number;
  drawLengthMm: number;
  /** Pen-up travel from X0 Y0 to the first stroke, between strokes, and to the park spot. */
  travelLengthMm: number;
  minutes: number;
};

/**
 * Lays the sketch out on the paper exactly as the robot will draw it: machine coordinates in
 * millimetres, touching strokes joined, and the finishing move. G-code export and the
 * stroke / time summary both use this, so they always agree.
 */
export function planPlot(sketch: Sketch, settings: PlotterSettings): PlotPlan {
  const { toPaper } = pixelToPaperTransform(sketch, settings);
  const strokes = joinStrokes(
    sketch.strokes.map((s) => s.map(toPaper)),
    JOIN_GAP_MM
  );
  // Always the configured spot: never derived from the layout or the last stroke.
  const park: Point = { x: settings.parkXMm, y: settings.parkYMm };

  let drawLengthMm = 0;
  let travelLengthMm = 0;
  let pen: Point = { x: 0, y: 0 };
  for (const stroke of strokes) {
    travelLengthMm += distance(pen, stroke[0]);
    drawLengthMm += polylineLength(stroke);
    pen = stroke[stroke.length - 1];
  }
  travelLengthMm += distance(pen, park);

  return {
    strokes,
    park,
    strokeCount: strokes.length,
    drawLengthMm,
    travelLengthMm,
    minutes: drawLengthMm / settings.drawFeedRate + travelLengthMm / settings.travelFeedRate,
  };
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

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

/** Validation rules matching these settings (see lib/gcode/validate.ts). */
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
