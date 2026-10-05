import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes a text file to the cache directory and opens the native share sheet for it. */
export async function shareTextFile(fileName: string, contents: string, mimeType: string) {
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: `Share ${fileName}` });
}
