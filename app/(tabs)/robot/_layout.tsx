import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/** Robot overview and its focused settings pages. */
export default function RobotLayout() {
  const colors = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
