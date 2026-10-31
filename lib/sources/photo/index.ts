// Photo → pen strokes. Order of work: decode → find subject & crop (photo.ts, background.ts)
// → line drawing? centre lines (centerline.ts, + learned model lines: model-lines.ts) : edges (edges.ts) → pixel chains (trace.ts) → clean chains (chains.ts) → strokes (pipeline.ts).
export {
  applyMask,
  backgroundPathData,
  removeBackground,
  type BackgroundRemoval,
} from './background';
export { decodeJpegBase64 } from './decode';
export {
  cropImage,
  LINE_MODEL_SIZE,
  photoToSketch,
  photoToSketchWithModel,
  PHOTO_WORK_SIZE,
  resizeImage,
  LINE_TRACE_SIZE,
  TRACE_SIZE,
  type CropRect,
  type LineModelRunner,
  type PhotoOptions,
  type PhotoSketch,
  type TraceMode,
} from './photo';
export {
  checkLineArt,
  inkDistance,
  inkMask,
  measureLineArt,
  penPaths,
  thin,
  type InkKind,
  type LineArtCheck,
} from './centerline';
export { addModelLines, type ModelLines } from './model-lines';
export * from './pipeline';
