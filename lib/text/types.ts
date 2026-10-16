/** One glyph: advance width, then strokes as flat [x0, y0, x1, y1, ...] lists (font units, y up). */
export type StrokeGlyph = [advance: number, strokes: number[][]];

/** A single-stroke ("engraving") font: every glyph is drawn as pen paths, not outlines. */
export type StrokeFont = {
  id: string;
  label: string;
  /** Name of the original font, for attribution. */
  source: string;
  metrics: {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    capHeight: number;
    xHeight: number;
  };
  glyphs: Record<string, StrokeGlyph>;
};
