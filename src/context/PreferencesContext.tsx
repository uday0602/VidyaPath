import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// UI-only preferences. localStorage is acceptable here because nothing learning-related is stored.
export interface Preferences {
  lowData: boolean;
  reduceMotion: boolean;
  fontScale: 1 | 1.125 | 1.25;
}

interface PreferencesValue extends Preferences {
  update: (patch: Partial<Preferences>) => void;
}

const STORAGE_KEY = "vidyapath.preferences";
const DEFAULTS: Preferences = { lowData: false, reduceMotion: false, fontScale: 1 };

const PreferencesContext = createContext<PreferencesValue>({ ...DEFAULTS, update: () => undefined });

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULTS;
  } catch (error) {
    console.warn("Could not read preferences", error);
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn("Could not save preferences", error);
    }
    const root = document.documentElement;
    root.classList.toggle("low-data", preferences.lowData);
    root.classList.toggle("reduce-motion", preferences.reduceMotion);
    root.style.setProperty("--font-scale", String(preferences.fontScale));
  }, [preferences]);

  const value = useMemo<PreferencesValue>(
    () => ({ ...preferences, update: (patch) => setPreferences((previous) => ({ ...previous, ...patch })) }),
    [preferences]
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  return useContext(PreferencesContext);
}
