import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

// Public values (safe to ship in the app). Row Level Security protects the data.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// A placeholder client keeps imports safe when the backend is not configured;
// every caller checks `isBackendConfigured` before making requests.
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || "https://not-configured.supabase.co",
  SUPABASE_ANON_KEY || "not-configured",
  {
    auth: {
      storage: Platform.OS === "web" ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  },
);

if (Platform.OS !== "web" && isBackendConfigured) {
  // Refresh tokens only while the app is in the foreground.
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
