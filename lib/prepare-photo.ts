import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Default longest side; photo mode asks for PHOTO_WORK_SIZE so it can crop before tracing. */
export const PROCESSING_SIZE = 512;

/** Downscales a picked photo and returns it as base64 JPEG for the sketch engine. */
export async function preparePhoto(
  uri: string,
  width: number,
  height: number,
  maxSize = PROCESSING_SIZE
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  // Some pickers (notably on web) can report 0 when the size is unknown; resize anyway.
  if (!width || !height || Math.max(width, height) > maxSize) {
    context.resize(width >= height ? { width: maxSize } : { height: maxSize });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
  if (!result.base64) throw new Error('Could not read the photo.');
  return result.base64;
}
