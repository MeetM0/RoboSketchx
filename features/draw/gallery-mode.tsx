import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ChipGroup } from '@/components/ui/chip';
import { Section } from '@/components/ui/list';
import { focusRing, type PressState } from '@/components/ui/pressable-styles';
import { Workspace } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Space } from '@/constants/theme';
import { PlotActionBar } from '@/features/plot/plot-action-bar';
import { SketchPreview } from '@/features/plot/sketch-preview';
import { StatusPill } from '@/features/robot/status-pill';
import { useTheme } from '@/hooks/use-theme';
import {
  CATALOG,
  CATALOG_CATEGORIES,
  pictureToSketch,
  type CatalogCategory,
  type CatalogPicture,
} from '@/lib/sources/catalog';
import { usePlotterSettings } from '@/state/plotter-settings';

const CATEGORY_OPTIONS = [
  { value: 'All', label: 'All' },
  ...CATALOG_CATEGORIES.map((c) => ({ value: c, label: c })),
] as const;

/** Ready-made cartoons: pick one, see it on the paper, send it. */
export function GalleryMode({ toolbar }: { toolbar: ReactNode }) {
  const { settings } = usePlotterSettings();
  const [category, setCategory] = useState<CatalogCategory | 'All'>('All');
  const [selectedId, setSelectedId] = useState(CATALOG[0].id);

  const selected = CATALOG.find((p) => p.id === selectedId) ?? CATALOG[0];
  const sketch = useMemo(() => pictureToSketch(selected), [selected]);
  const pictures = category === 'All' ? CATALOG : CATALOG.filter((p) => p.category === category);

  return (
    <Workspace
      title="Draw"
      headerRight={<StatusPill />}
      toolbar={toolbar}
      stage={
        <SketchPreview
          sketch={sketch}
          settings={settings}
          caption={`${selected.name} · ${selected.category}`}
          label={`${selected.name} on the paper`}
        />
      }
      footer={
        <PlotActionBar
          sketch={sketch}
          emptyHint="Choose a picture."
          fileName={`robosketch-${selected.id}`}
        />
      }>
      <Section title="Pictures">
        <ChipGroup
          label="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />
        <View style={styles.grid}>
          {pictures.map((picture) => (
            <Thumbnail
              key={picture.id}
              picture={picture}
              selected={picture.id === selected.id}
              onPress={() => setSelectedId(picture.id)}
            />
          ))}
        </View>
      </Section>
    </Workspace>
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
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={picture.name}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={(state: PressState) => [styles.thumb, focusRing(state, colors)]}>
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.thumbPaper,
              {
                backgroundColor: colors.paper,
                borderColor: selected
                  ? colors.accent
                  : pressed
                    ? colors.borderStrong
                    : colors.border,
              },
              selected && styles.thumbSelected,
            ]}>
            <Svg width="100%" height="100%" viewBox="-6 -6 112 112">
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
          <Text variant="caption" tone={selected ? 'accent' : 'secondary'} numberOfLines={1}>
            {picture.name}
          </Text>
        </>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.md,
  },
  thumb: {
    // Three per row in the narrowest column; the gap is 12.
    width: '30.5%',
    flexGrow: 1,
    maxWidth: 160,
    gap: Space.xs,
    borderRadius: Radius.card,
  },
  thumbPaper: {
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.xs,
  },
  thumbSelected: {
    borderWidth: 2,
    padding: Space.xs - 1,
  },
});
