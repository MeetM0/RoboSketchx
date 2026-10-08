import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useAppearance } from '@/lib/appearance';

/** The colour scheme in use: the person's choice, or the system's when they follow it. */
export function useColorScheme() {
  const system = useSystemColorScheme();
  const { preference } = useAppearance();
  return preference === 'system' ? system : preference;
}
