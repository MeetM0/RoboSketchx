import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { focusRing, type PressState } from './pressable-styles';
import { Text } from './text';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
};

/** A scrolling row of filter chips; for longer option lists than `Segmented` fits. */
export function ChipGroup<T extends string>({ options, value, onChange, label }: Props<T>) {
  const colors = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={(state: PressState) => [
              styles.chip,
              {
                backgroundColor: selected
                  ? colors.accentSubtle
                  : state.pressed
                    ? colors.surfaceMuted
                    : colors.surface,
                borderColor: selected ? colors.accent : colors.border,
              },
              focusRing(state, colors),
            ]}>
            <Text variant="label" tone={selected ? 'accent' : 'default'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Space.sm,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
});
