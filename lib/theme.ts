import { useColorScheme } from "react-native";
import { usePreferences } from "./preferences";

// "Ink & Champagne": deep navy ink, warm ivory paper and a restrained gold accent.
const light = {
  background: "#F6F4EF",
  surface: "#FFFFFF",
  surfaceAlt: "#EFEBE3",
  elevated: "#FFFFFF",
  ink: "#0F1B2D",
  text: "#14171F",
  textMuted: "#6E695F",
  textFaint: "#A39D91",
  border: "#E5E0D5",
  borderStrong: "#D3CCBD",
  accent: "#B08A4E",
  accentSoft: "#F3EAD7",
  primary: "#0F1B2D",
  onPrimary: "#F6F1E6",
  success: "#2F7D5B",
  successSoft: "#E3F1EA",
  warning: "#B5741C",
  warningSoft: "#FBEFD9",
  danger: "#B4443C",
  dangerSoft: "#F8E3E1",
  overlay: "rgba(15,27,45,0.45)",
  heroFrom: "#13243A",
  heroTo: "#0B1524",
};

export type Palette = typeof light;

const dark: Palette = {
  background: "#0B0D11",
  surface: "#14171D",
  surfaceAlt: "#1B1F27",
  elevated: "#1D222B",
  ink: "#F3EEE4",
  text: "#F1ECE2",
  textMuted: "#A09A8E",
  textFaint: "#6B665D",
  border: "#262A33",
  borderStrong: "#363B46",
  accent: "#D2B07A",
  accentSoft: "#2C261C",
  primary: "#D2B07A",
  onPrimary: "#14110B",
  success: "#5DC197",
  successSoft: "#15291F",
  warning: "#E6AA52",
  warningSoft: "#2E2416",
  danger: "#EE7F76",
  dangerSoft: "#33191A",
  overlay: "rgba(0,0,0,0.6)",
  heroFrom: "#1B2433",
  heroTo: "#0F141C",
};

export const fonts = {
  regular: "IBMPlexSansArabic_400Regular",
  medium: "IBMPlexSansArabic_500Medium",
  semibold: "IBMPlexSansArabic_600SemiBold",
  bold: "IBMPlexSansArabic_700Bold",
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export function useTheme() {
  const system = useColorScheme();
  const { themeMode } = usePreferences();
  const scheme = themeMode === "system" ? (system ?? "light") : themeMode;
  return { colors: scheme === "dark" ? dark : light, scheme, fonts, radius, space } as const;
}
