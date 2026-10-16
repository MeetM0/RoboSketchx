import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Space } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { focusRing, type PressState } from './pressable-styles';
import { Text } from './text';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Accessible name of the group, e.g. "Detail". */
  label?: string;
};

/** One choice out of 2–5 short options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label,
}: Props<T>) {
  const colors = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.track, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={(state: PressState) => [
              styles.segment,
              selected && {
                backgroundColor: colors.surface,
                borderColor: colors.borderStrong,
              },
              disabled && styles.disabled,
              focusRing(state, colors),
            ]}>
            <Text
              variant="label"
              tone={selected ? 'default' : 'secondary'}
              style={selected && styles.selectedLabel}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Radius.control + 2,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.sm,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedLabel: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
