import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Determinate progress, 0–1. */
export function ProgressBar({
  value,
  tone = 'accent',
  label,
}: {
  value: number;
  tone?: 'accent' | 'danger' | 'success';
  label: string;
}) {
  const colors = useTheme();
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View
      role="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: colors[tone] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
