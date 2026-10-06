import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
    <View accessibilityRole="radiogroup" style={styles.grid}>
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
  const colors = Colors[useColorScheme() ?? 'light'];
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
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: selected ? colors.tint : colors.border,
          borderWidth: selected ? 2 : 1,
        },
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
      <ThemedText style={[styles.label, { color: selected ? colors.text : colors.icon }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    flexBasis: '45%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
});
