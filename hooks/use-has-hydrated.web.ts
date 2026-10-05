import { useEffect, useState } from 'react';

/**
 * False during static rendering and the first client render, true after hydration.
 * Lets components defer output that can't match the server HTML (e.g. icon fonts).
 */
export function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
}
