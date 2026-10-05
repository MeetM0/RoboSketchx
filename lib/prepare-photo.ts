import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Longest side of the image fed to edge detection. Larger gives finer lines but processing
 * time grows with the pixel count and the strokes get too dense for a pen to reproduce.
 */
const PROCESSING_SIZE = 512;

/** Downscales a picked photo and returns it as base64 JPEG for the sketch engine. */
export async function preparePhoto(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  // Some pickers (notably on web) can report 0 when the size is unknown; resize anyway.
  if (!width || !height || Math.max(width, height) > PROCESSING_SIZE) {
    context.resize(width >= height ? { width: PROCESSING_SIZE } : { height: PROCESSING_SIZE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
  if (!result.base64) throw new Error('Could not read the photo.');
  return result.base64;
}
