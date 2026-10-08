/** Native apps are never server-rendered, so they're always hydrated. */
export function useHasHydrated() {
  return true;
}
