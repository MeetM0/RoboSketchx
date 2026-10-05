import type { Point, Sketch } from './types';

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
};

export const DEFAULT_PLOTTER_SETTINGS: PlotterSettings = {
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginMm: 10,
  drawFeedRate: 1500,
  travelFeedRate: 3000,
  penUpCommand: 'G0 Z5',
  penDownCommand: 'G1 Z0',
};

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

export function sketchToGcode(sketch: Sketch, settings: PlotterSettings): string {
  const { toPaper } = pixelToPaperTransform(sketch, settings);
  const fmt = (p: Point) => `X${round(p.x).toFixed(2)} Y${round(p.y).toFixed(2)}`;
  const lines = [
    '; RoboSketch',
    `; paper ${settings.paperWidthMm}x${settings.paperHeightMm}mm, margin ${settings.marginMm}mm, ${sketch.strokes.length} strokes`,
    'G21 ; millimetres',
    'G90 ; absolute positioning',
    settings.penUpCommand,
  ];
  for (const stroke of sketch.strokes) {
    const [first, ...rest] = stroke.map(toPaper);
    lines.push(`G0 ${fmt(first)} F${settings.travelFeedRate}`);
    lines.push(settings.penDownCommand);
    for (const p of rest) lines.push(`G1 ${fmt(p)} F${settings.drawFeedRate}`);
    lines.push(settings.penUpCommand);
  }
  lines.push(`G0 X0 Y0 F${settings.travelFeedRate}`, '');
  return lines.join('\n');
}
