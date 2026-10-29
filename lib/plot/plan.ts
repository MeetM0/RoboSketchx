import { joinStrokes, polylineLength } from '../geometry/polyline';
import type { Point, Polyline, Sketch } from '../geometry/types';
import type { PlotterSettings } from './settings';

/** Strokes whose ends are this close on paper are drawn as one, without lifting the pen. */
export const JOIN_GAP_MM = 0.3;

/**
 * Maps sketch coordinates onto the paper: the drawing is scaled to fit inside the margins
 * (aspect preserved) and centred. By default the *stroke* bounding box is fitted, so empty
 * image areas around the subject don't shrink the drawing; sketches whose coordinates are
 * already a layout (text in the writing area) set `fit: 'frame'`.
 *
 * Machine Y points up and X0 Y0 is the paper's bottom-left: this is the only place the
 * image's y-down coordinates are flipped.
 */
export function pixelToPaperTransform(sketch: Sketch, settings: PlotterSettings) {
  const usableW = settings.paperWidthMm - 2 * settings.marginMm;
  const usableH = settings.paperHeightMm - 2 * settings.marginMm;
  const box =
    sketch.fit === 'frame' || !sketch.strokes.length
      ? { minX: 0, minY: 0, maxX: sketch.width, maxY: sketch.height }
      : strokeBounds(sketch.strokes);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const limits = [w > 0 ? usableW / w : Infinity, h > 0 ? usableH / h : Infinity];
  const scale = Number.isFinite(Math.min(...limits)) ? Math.min(...limits) : 1;
  // Paper position of the box's left edge and its distance from the paper's top edge.
  const left = settings.marginMm + (usableW - w * scale) / 2;
  const top = settings.marginMm + (usableH - h * scale) / 2;
  return {
    scale,
    /** Translation for drawing sketch coordinates on a y-down preview of the paper. */
    previewOffsetX: left - box.minX * scale,
    previewOffsetY: top - box.minY * scale,
    toPaper: (p: Point): Point => ({
      x: left + (p.x - box.minX) * scale,
      y: settings.paperHeightMm - (top + (p.y - box.minY) * scale),
    }),
  };
}

export function strokeBounds(strokes: Polyline[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX, minY, maxX, maxY };
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
