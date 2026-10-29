/** Everything about the machine and the paper that changes the drawing or the G-code. */
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
