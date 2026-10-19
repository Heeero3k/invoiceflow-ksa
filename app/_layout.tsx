import { IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold, IBMPlexSansArabic_700Bold, useFonts } from "@expo-google-fonts/ibm-plex-sans-arabic";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { iconFont } from "@/components/ui/icon";
import { initAds } from "@/lib/ads";
import { AuthProvider } from "@/lib/auth";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { StoreProvider } from "@/lib/store";
import { useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppStack() {
  const { colors, scheme } = useTheme();
  const { ready, language } = usePreferences();

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = language;
      // Keep the document LTR like native; components mirror themselves per language.
      document.documentElement.dir = "ltr";
      document.body.style.backgroundColor = colors.background;
    }
  }, [colors.background, language]);

  if (!ready) return null;
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal", animation: "fade" }} />
        <Stack.Screen name="batch/[id]" />
        <Stack.Screen name="invoice/[id]" />
        <Stack.Screen name="export" options={{ presentation: "modal" }} />
        <Stack.Screen name="sign-in" options={{ presentation: "modal" }} />
        <Stack.Screen name="auth-callback" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    ...iconFont,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void initAds();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PreferencesProvider>
          <AuthProvider>
            <StoreProvider>
              <AppStack />
            </StoreProvider>
          </AuthProvider>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
