import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({ options, value, onChange, disabled }: Props<T>) {
  const colors = Colors[useColorScheme() ?? 'light'];

  return (
    <View
      accessibilityRole="radiogroup"
      style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.tint },
              disabled && { opacity: 0.5 },
            ]}>
            <ThemedText
              type="defaultSemiBold"
              style={{ color: selected ? colors.onTint : colors.text, fontSize: 14 }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
});
