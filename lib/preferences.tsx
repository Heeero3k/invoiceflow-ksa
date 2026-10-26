import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Language = "ar" | "en";
export type ThemeMode = "system" | "light" | "dark";

type Preferences = {
  language: Language;
  themeMode: ThemeMode;
  /** Upload original photos/PDFs to the private cloud bucket when signed in. */
  keepOriginals: boolean;
  /** Export Excel files in the app language or always Arabic/English. */
  exportLanguage: Language;
  /** Keep one Excel file per project per day updated in the user's Google Drive. */
  dailyDriveFile: boolean;
};

type PreferencesValue = Preferences & {
  ready: boolean;
  update: (patch: Partial<Preferences>) => void;
};

const STORAGE_KEY = "invoiceflow.preferences.v2";

function defaultLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Preferences>(() => {
    const language = defaultLanguage();
    return { language, themeMode: "system", keepOriginals: true, exportLanguage: language, dailyDriveFile: true };
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState((current) => ({ ...current, ...(JSON.parse(raw) as Partial<Preferences>) }));
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch: Partial<Preferences>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...state, ready, update }), [state, ready, update]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}
