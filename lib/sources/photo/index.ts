// Photo → pen strokes. Order of work: decode → find subject & crop (photo.ts, background.ts)
// → line drawing? centre lines (centerline.ts) : edges (edges.ts) → pixel chains (trace.ts) → clean chains (chains.ts) → strokes (pipeline.ts).
export {
  applyMask,
  backgroundPathData,
  removeBackground,
  type BackgroundRemoval,
} from './background';
export { decodeJpegBase64 } from './decode';
export {
  cropImage,
  photoToSketch,
  PHOTO_WORK_SIZE,
  resizeImage,
  TRACE_SIZE,
  type CropRect,
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
export * from './pipeline';
