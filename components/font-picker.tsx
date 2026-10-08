import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { focusRing, type PressState } from '@/components/ui/pressable-styles';
import { Text } from '@/components/ui/text';
import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sketchToSvgPathData } from '@/lib/sketch';
import { FONTS, layoutText, type FontId } from '@/lib/text/layout';

const SAMPLE = 'Hello';
const SAMPLE_AREA = { widthMm: 60, heightMm: 16 };

type Props = {
  value: FontId;
  onChange: (font: FontId) => void;
};

/** A 2×2 grid of font cards, each showing a sample written in that font. */
export function FontPicker({ value, onChange }: Props) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Font" style={styles.grid}>
      {FONTS.map((font) => (
        <FontCard
          key={font.id}
          id={font.id}
          label={font.label}
          selected={font.id === value}
          onPress={() => onChange(font.id)}
        />
      ))}
    </View>
  );
}

function FontCard({
  id,
  label,
  selected,
  onPress,
}: {
  id: FontId;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useTheme();
  const pathData = useMemo(
    () =>
      sketchToSvgPathData(
        layoutText(SAMPLE, SAMPLE_AREA, {
          font: id,
          letterHeightMm: 8,
          lineSpacing: 1,
          align: 'center',
          natural: false,
        }).sketch
      ),
    [id]
  );

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={(state: PressState) => [
        styles.card,
        {
          backgroundColor: selected
            ? colors.accentSubtle
            : state.pressed
              ? colors.surfaceMuted
              : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
        selected && styles.selected,
        focusRing(state, colors),
      ]}>
      <Svg width="100%" height={40} viewBox={`0 0 ${SAMPLE_AREA.widthMm} ${SAMPLE_AREA.heightMm}`}>
        <Path
          d={pathData}
          fill="none"
          stroke={colors.text}
          strokeWidth={0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text variant="caption" tone={selected ? 'accent' : 'secondary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  card: {
    flexBasis: '45%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  selected: {
    borderWidth: 2,
    paddingVertical: Space.sm - 1,
    paddingHorizontal: Space.sm - 1,
  },
});
