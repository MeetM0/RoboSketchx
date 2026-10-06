/** A point in image pixel space (origin top-left, y pointing down). */
export type Point = { x: number; y: number };

/** Decoded image: RGBA bytes, row by row from the top-left. */
export type RgbaImage = { data: Uint8Array; width: number; height: number };

/** A continuous pen-down stroke. */
export type Polyline = Point[];

export type DetailLevel = 'low' | 'medium' | 'high';

export type SketchOptions = {
  /** Gaussian blur strength applied before edge detection. Higher = fewer, smoother lines. */
  blurSigma: number;
  /** At most this fraction (0-1) of the image's pixels can be "strong" edges. */
  strongEdgeFraction: number;
  /** Minimum brightness step (0-255 grey levels) that can start a line; filters out noise. */
  minContrast: number;
  /** Weak-edge threshold as a fraction of the strong threshold (Canny hysteresis). */
  weakRatio: number;
  /** Strokes shorter than this (in pixels) are dropped as noise. */
  minStrokeLength: number;
  /** Ramer–Douglas–Peucker tolerance in pixels; higher = fewer points per stroke. */
  simplifyTolerance: number;
};

export type Sketch = {
  /** Size of the processed image in pixels; the coordinate space of `strokes`. */
  width: number;
  height: number;
  /** Strokes in drawing order (already optimised to reduce pen-up travel). */
  strokes: Polyline[];
  /**
   * How the sketch is placed on the paper: `strokes` (default) fits and centres the strokes'
   * bounding box; `frame` fits the whole width × height frame (used when the coordinates are
   * already a layout in the writing area, e.g. text).
   */
  fit?: 'strokes' | 'frame';
};

export type SketchStats = {
  strokeCount: number;
  pointCount: number;
  /** Total pen-down distance in pixels. */
  drawLength: number;
  /** Total pen-up travel distance in pixels (including from the origin to the first stroke). */
  travelLength: number;
};
