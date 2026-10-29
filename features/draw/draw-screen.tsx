import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';

import { GalleryMode } from './gallery-mode';
import { PhotoMode } from './photo-mode';

const MODE_OPTIONS = [
  { value: 'gallery', label: 'Gallery' },
  { value: 'photo', label: 'Photo' },
] as const;

type DrawMode = (typeof MODE_OPTIONS)[number]['value'];

/** Draw tab: a ready-made picture (Gallery) or your own photo (Photo). */
export default function DrawScreen() {
  const [mode, setMode] = useState<DrawMode>('gallery');
  const toolbar = (
    <Segmented label="Source" options={MODE_OPTIONS} value={mode} onChange={setMode} />
  );

  // Both stay mounted so a traced photo survives a look at the gallery.
  return (
    <View style={styles.fill}>
      <View style={[styles.fill, mode !== 'gallery' && styles.hidden]}>
        <GalleryMode toolbar={toolbar} />
      </View>
      <View style={[styles.fill, mode !== 'photo' && styles.hidden]}>
        <PhotoMode toolbar={toolbar} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});
