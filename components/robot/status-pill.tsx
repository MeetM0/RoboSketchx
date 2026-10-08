import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { focusRing, type PressState } from '@/components/ui/pressable-styles';
import { Text } from '@/components/ui/text';
import { Layout, Radius, Space, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRobot } from '@/lib/robot/robot-context';

import { describeRobot, type StatusTone } from './status';

const DOT: Record<StatusTone, keyof Palette> = {
  neutral: 'textTertiary',
  progress: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

/** Robot connection / job state in the header; opens the Robot tab. */
export function StatusPill() {
  const colors = useTheme();
  const router = useRouter();
  const { status, robot, job } = useRobot();
  const { label, tone } = describeRobot(status, robot?.name ?? null, job);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Robot: ${label}. Open robot settings`}
      onPress={() => router.navigate('/robot')}
      hitSlop={4}
      style={(state: PressState) => [
        styles.pill,
        {
          borderColor: colors.border,
          backgroundColor: state.pressed || state.hovered ? colors.surfaceMuted : colors.surface,
        },
        focusRing(state, colors),
      ]}>
      <View style={[styles.dot, { backgroundColor: colors[DOT[tone]] }]} />
      <Text variant="label" numberOfLines={1} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Layout.hitTarget - 8,
    paddingHorizontal: Space.md,
    borderWidth: 1,
    borderRadius: Radius.pill,
    maxWidth: 220,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flexShrink: 1,
  },
});
