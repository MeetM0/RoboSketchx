import { orderStrokes, polylineLength, simplify } from '../../geometry/polyline';
import type { DetailLevel, Polyline, RgbaImage, Sketch, SketchOptions } from '../../geometry/types';
import { DEFAULT_PLOTTER_SETTINGS } from '../../plot/settings';
import { checkLineArt, closeJunctions } from './centerline';
import { dropRedundantChains, linkChains, smoothChain } from './chains';
import { detectEdgeField, refineSubpixel } from './edges';
import { traceEdges } from './trace';

/** Joined chain ends must continue each other's direction within this angle. */
export const LINK_MAX_ANGLE_DEG = 45;
/** Chains entirely within this distance (traced px) of a longer chain are duplicates. */
export const REDUNDANT_TOLERANCE_PX = 1.5;

/** Gaussian σ (in traced pixels) used to smooth pixel chains before simplification. */
export const CHAIN_SMOOTHING_SIGMA_PX = 1.25;

/**
 * Detail presets. Size thresholds are in millimetres on paper and converted to traced pixels
 * with the scale the drawing will be plotted at, so results don't depend on photo resolution.
 */
export const DETAIL_PRESETS: Record<DetailLevel, SketchOptions> = {
  low: {
    blurSigma: 2.2,
    strongEdgeFraction: 0.03,
    minContrast: 40,
    weakRatio: 0.5,
    minStrokeLengthMm: 5,
    simplifyToleranceMm: 0.04,
    linkGapMm: 1,
  },
  medium: {
    blurSigma: 1.6,
    strongEdgeFraction: 0.05,
    minContrast: 25,
    weakRatio: 0.45,
    minStrokeLengthMm: 3,
    simplifyToleranceMm: 0.04,
    linkGapMm: 1,
  },
  high: {
    blurSigma: 1.1,
    strongEdgeFraction: 0.08,
    minContrast: 14,
    weakRatio: 0.4,
    minStrokeLengthMm: 1.5,
    simplifyToleranceMm: 0.04,
    linkGapMm: 1,
  },
};

/** Linking below ~1.5 px can't bridge a broken pixel chain, whatever the mm value says. */
const MIN_LINK_GAP_PX = 1.5;

/** Converts a preset's millimetre thresholds to traced pixels for a given scale. */
export function resolveThresholds(options: SketchOptions, mmPerPx: number) {
  return {
    minStrokeLengthPx: options.minStrokeLengthMm / mmPerPx,
    simplifyTolerancePx: options.simplifyToleranceMm / mmPerPx,
    linkGapPx: Math.max(MIN_LINK_GAP_PX, options.linkGapMm / mmPerPx),
  };
}

/** mm per pixel when an image frame is fitted into the default (A4) printable area. */
export function defaultMmPerPx(width: number, height: number) {
  const s = DEFAULT_PLOTTER_SETTINGS;
  return Math.min(
    (s.paperWidthMm - 2 * s.marginMm) / width,
    (s.paperHeightMm - 2 * s.marginMm) / height
  );
}

/**
 * Converts an image into ordered pen strokes. `mmPerPx` is the paper scale the result will be
 * drawn at; the preset's thresholds are in mm and converted with it.
 */
export function imageToSketch(
  { data, width, height }: RgbaImage,
  options: SketchOptions,
  mmPerPx = defaultMmPerPx(width, height)
): Sketch {
  const px = resolveThresholds(options, mmPerPx);
  const field = detectEdgeField(
    data,
    width,
    height,
    options.blurSigma,
    options.strongEdgeFraction,
    options.weakRatio,
    options.minContrast
  );
  return chainsToSketch(traceEdges(field.edges, width, height), width, height, px, (chain) =>
    refineSubpixel(chain, field)
  );
}

/**
 * Line drawings: traces the centre of each ink line and the outline of each solid shape (see
 * `centerline.ts`) instead of the two edges of every line, so each drawn line is one stroke.
 */
export function lineArtToSketch(
  image: RgbaImage,
  options: SketchOptions,
  mmPerPx = defaultMmPerPx(image.width, image.height),
  paths = checkLineArt(image).paths
): Sketch {
  const { width, height } = image;
  return chainsToSketch(
    closeJunctions(traceEdges(paths, width, height), paths, width, height),
    width,
    height,
    resolveThresholds(options, mmPerPx)
  );
}

/**
 * Pixel chains → pen strokes, shared by edge and centre-line tracing: link broken chains, drop
 * duplicates and short scraps, smooth the pixel staircase, simplify, and order the strokes.
 */
function chainsToSketch(
  chains: Polyline[],
  width: number,
  height: number,
  px: ReturnType<typeof resolveThresholds>,
  refine: (chain: Polyline) => Polyline = (chain) => chain
): Sketch {
  const traced = dropRedundantChains(
    linkChains(chains, px.linkGapPx, LINK_MAX_ANGLE_DEG),
    REDUNDANT_TOLERANCE_PX
  );
  const strokes = traced
    .filter((s) => s.length > 1 && polylineLength(s) >= px.minStrokeLengthPx)
    .map((s) => simplify(smoothChain(refine(s), CHAIN_SMOOTHING_SIGMA_PX), px.simplifyTolerancePx));
  // Machine X0 Y0 is the bottom-left of the paper: bottom-left of the image.
  return { width, height, strokes: orderStrokes(strokes, { x: 0, y: height }) };
}
