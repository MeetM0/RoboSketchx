import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { SegmentedControl } from '@/components/segmented-control';
import { SketchActions } from '@/components/sketch-actions';
import { SketchPreview } from '@/components/sketch-preview';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CATALOG,
  CATALOG_CATEGORIES,
  pictureToSketch,
  type CatalogCategory,
  type CatalogPicture,
} from '@/lib/catalog';
import { usePlotterSettings } from '@/lib/plotter-settings';

const CATEGORY_OPTIONS = [
  { value: 'All', label: 'All' },
  ...CATALOG_CATEGORIES.map((c) => ({ value: c, label: c })),
] as const;

/** Ready-made cartoons: pick one, preview it on the paper, export its G-code. */
export function CatalogBrowser() {
  const { settings } = usePlotterSettings();
  const [category, setCategory] = useState<CatalogCategory | 'All'>('All');
  const [selectedId, setSelectedId] = useState(CATALOG[0].id);
  const [error, setError] = useState<string | null>(null);

  const selected = CATALOG.find((p) => p.id === selectedId) ?? CATALOG[0];
  const sketch = useMemo(() => pictureToSketch(selected), [selected]);
  const pictures = category === 'All' ? CATALOG : CATALOG.filter((p) => p.category === category);

  return (
    <>
      <SketchPreview sketch={sketch} settings={settings} />
      <ThemedText type="subtitle">{selected.name}</ThemedText>
      <SketchActions sketch={sketch} fileName={`robosketch-${selected.id}`} onError={setError} />
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <View style={styles.section}>
        <ThemedText type="defaultSemiBold">Catalog</ThemedText>
        <SegmentedControl options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
        <View style={styles.grid}>
          {pictures.map((picture) => (
            <Thumbnail
              key={picture.id}
              picture={picture}
              selected={picture.id === selected.id}
              onPress={() => {
                setSelectedId(picture.id);
                setError(null);
              }}
            />
          ))}
        </View>
      </View>
    </>
  );
}

function Thumbnail({
  picture,
  selected,
  onPress,
}: {
  picture: CatalogPicture;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = Colors[useColorScheme() ?? 'light'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={picture.name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.paper,
          borderColor: selected ? colors.tint : colors.border,
          borderWidth: selected ? 2 : 1,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <View style={styles.thumbnail}>
        <Svg width="100%" height="100%" viewBox="-4 -4 108 108">
          <Path
            d={picture.paths.join(' ')}
            fill="none"
            stroke={colors.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
      <ThemedText style={[styles.cardLabel, { color: colors.ink }]} numberOfLines={1}>
        {picture.name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    // Three per row; flexGrow lets the last row stretch evenly.
    flexBasis: '30%',
    flexGrow: 1,
    maxWidth: '33%',
    alignItems: 'center',
    padding: 6,
    borderRadius: 12,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 1,
  },
  cardLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: '#D93025',
  },
});
