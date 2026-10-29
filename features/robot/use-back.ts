import { useRouter } from 'expo-router';

/** Back to the Robot overview, also when a settings page was opened directly (web). */
export function useBackToRobot() {
  const router = useRouter();
  return () => (router.canGoBack() ? router.back() : router.replace('/robot'));
}
