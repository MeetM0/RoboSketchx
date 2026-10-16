import { DEFAULT_SAMPLING, type ValidationRules } from '../../lib/gcode/validate';

/** Rules for the A4 defaults: 10 mm margin, Z pen (up 5, down 0), park at X0 Y0. */
export const A4_RULES: ValidationRules = {
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginMm: 10,
  park: { x: 0, y: 0 },
  pen: { mode: 'z', upZ: 5, downZ: 0 },
  ...DEFAULT_SAMPLING,
};
