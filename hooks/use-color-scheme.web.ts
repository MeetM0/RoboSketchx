import { useEffect, useState } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { useAppearance } from '@/lib/appearance';

/**
 * The colour scheme in use: the person's choice, or the system's when they follow it.
 * Static web HTML is rendered light; the real scheme applies after hydration.
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const system = useSystemColorScheme();
  const { preference } = useAppearance();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  if (!hasHydrated) return 'light';
  return preference === 'system' ? system : preference;
}
