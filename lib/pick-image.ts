import * as ImagePicker from 'expo-image-picker';

export type PickedImage = { uri: string; width: number; height: number };

/**
 * Takes a photo or picks one from the library. Resolves to `null` if the person cancels;
 * throws with a readable message if camera permission is refused.
 */
export async function pickImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  if (source === 'camera' && process.env.EXPO_OS !== 'web') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera permission is needed to take a photo.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const { uri, width, height } = result.assets[0];
  return { uri, width, height };
}
