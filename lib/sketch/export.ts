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
  /** Travel speed (mm/min) while the pen is up. */
  travelFeedRate: number;
  /** G-code lines that lift / lower the pen. Depends on the machine (servo vs Z axis). */
  penUpCommand: string;
  penDownCommand: string;
  /**
   * Where the pen goes when the drawing is done:
   * - `corner` — the paper corner nearest to the last stroke (short move, keeps the pen
   *   off the drawing);
   * - `stay`   — stay where the last stroke ended;
   * - `origin` — back to X0 Y0.
   */
  finishAt: 'corner' | 'stay' | 'origin';
};

export const DEFAULT_PLOTTER_SETTINGS: PlotterSettings = {
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginMm: 10,
  drawFeedRate: 1500,
  travelFeedRate: 3000,
  penUpCommand: 'G0 Z5',
  penDownCommand: 'G1 Z0',
  finishAt: 'corner',
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
  /** Where the pen parks afterwards; null to stay put. */
  park: Point | null;
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
  const last = strokes.length ? strokes[strokes.length - 1] : null;
  const end = last ? last[last.length - 1] : { x: 0, y: 0 };

  let park: Point | null = null;
  if (settings.finishAt === 'origin') park = { x: 0, y: 0 };
  else if (settings.finishAt === 'corner' && last) {
    const corners = [
      { x: 0, y: 0 },
      { x: settings.paperWidthMm, y: 0 },
      { x: 0, y: settings.paperHeightMm },
      { x: settings.paperWidthMm, y: settings.paperHeightMm },
    ];
    park = corners.reduce((best, c) => (distance(end, c) < distance(end, best) ? c : best));
  }

  let drawLengthMm = 0;
  let travelLengthMm = 0;
  let pen: Point = { x: 0, y: 0 };
  for (const stroke of strokes) {
    travelLengthMm += distance(pen, stroke[0]);
    drawLengthMm += polylineLength(stroke);
    pen = stroke[stroke.length - 1];
  }
  if (park) travelLengthMm += distance(pen, park);

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

export function sketchToGcode(sketch: Sketch, settings: PlotterSettings): string {
  const plan = planPlot(sketch, settings);
  const fmt = (p: Point) => `X${round(p.x).toFixed(2)} Y${round(p.y).toFixed(2)}`;
  const lines = [
    '; RoboSketch',
    `; paper ${settings.paperWidthMm}x${settings.paperHeightMm}mm, margin ${settings.marginMm}mm, ${plan.strokeCount} strokes`,
    'G21 ; millimetres',
    'G90 ; absolute positioning',
    settings.penUpCommand,
  ];
  for (const stroke of plan.strokes) {
    const [first, ...rest] = stroke;
    lines.push(`G0 ${fmt(first)} F${settings.travelFeedRate}`);
    lines.push(settings.penDownCommand);
    for (const p of rest) lines.push(`G1 ${fmt(p)} F${settings.drawFeedRate}`);
    lines.push(settings.penUpCommand);
  }
  if (plan.park) lines.push(`G0 ${fmt(plan.park)} F${settings.travelFeedRate}`);
  lines.push('');
  return lines.join('\n');
}
