import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Appearance } from 'react-native';

export type AppearancePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'robosketch.appearance.v1';

type AppearanceContextValue = {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** Light / dark choice: follow the system (default) or force one, remembered across launches. */
export function AppearanceProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] = useState<AppearancePreference>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') setPreference(stored);
      })
      .catch((error) => console.warn('Could not load appearance', error))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    // Native: also switches system UI (alerts, keyboard, status bar) to match.
    if (process.env.EXPO_OS !== 'web') {
      Appearance.setColorScheme(preference === 'system' ? null : preference);
    }
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, preference).catch((error) =>
      console.warn('Could not save appearance', error)
    );
  }, [loaded, preference]);

  return (
    <AppearanceContext.Provider value={{ preference, setPreference }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
