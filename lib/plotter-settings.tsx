import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { DEFAULT_PLOTTER_SETTINGS, type PlotterSettings } from '@/lib/sketch';

const STORAGE_KEY = 'robosketch.plotterSettings.v1';

type PlotterSettingsContextValue = {
  settings: PlotterSettings;
  updateSettings: (patch: Partial<PlotterSettings>) => void;
  resetSettings: () => void;
};

const PlotterSettingsContext = createContext<PlotterSettingsContextValue | null>(null);

export function PlotterSettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<PlotterSettings>(DEFAULT_PLOTTER_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) setSettings({ ...DEFAULT_PLOTTER_SETTINGS, ...JSON.parse(stored) });
      })
      .catch((error) => console.warn('Could not load plotter settings', error))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    // Don't overwrite stored settings with the defaults before they've been read.
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch((error) =>
      console.warn('Could not save plotter settings', error)
    );
  }, [loaded, settings]);

  return (
    <PlotterSettingsContext.Provider
      value={{
        settings,
        updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
        resetSettings: () => setSettings(DEFAULT_PLOTTER_SETTINGS),
      }}>
      {children}
    </PlotterSettingsContext.Provider>
  );
}

export function usePlotterSettings() {
  const value = useContext(PlotterSettingsContext);
  if (!value) throw new Error('usePlotterSettings must be used inside PlotterSettingsProvider');
  return value;
}
