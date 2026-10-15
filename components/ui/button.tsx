import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useI18n } from "@/lib/i18n";
import { fonts, radius, useTheme } from "@/lib/theme";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "lg" | "md" | "sm";

export function haptic(kind: "light" | "success" | "warning" = "light") {
  if (Platform.OS === "web") return;
  if (kind === "light") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else void Haptics.notificationAsync(kind === "success" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  loading,
  disabled,
  style,
  full = true,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName | string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
}) {
  const { colors } = useTheme();
  const { row } = useI18n();
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    accent: { bg: colors.accent, fg: "#FFFFFF", border: colors.accent },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: "transparent", fg: colors.text, border: "transparent" },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];
  const height = size === "lg" ? 54 : size === "md" ? 46 : 36;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        { height, backgroundColor: palette.bg, borderColor: palette.border, borderRadius: size === "sm" ? radius.sm : radius.md, flexDirection: row, alignSelf: full ? "stretch" : "flex-start", paddingHorizontal: size === "sm" ? 12 : 18 },
        inactive && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 17 : 20} color={palette.fg} /> : null}
          <Text style={{ color: palette.fg, fontFamily: fonts.semibold, fontSize: size === "sm" ? 13 : 15 }} numberOfLines={1} align="center">
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = "default", size = 40, filled = true }: { icon: IconName | string; onPress: () => void; label: string; tone?: "default" | "inverse" | "accent" | "danger"; size?: number; filled?: boolean }) {
  const { colors } = useTheme();
  const bg = !filled ? "transparent" : tone === "inverse" ? "rgba(255,255,255,0.14)" : tone === "accent" ? colors.accentSoft : tone === "danger" ? colors.dangerSoft : colors.surface;
  const fg = tone === "inverse" ? "#FFFFFF" : tone === "accent" ? colors.accent : tone === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg, alignItems: "center", justifyContent: "center", borderWidth: filled && tone === "default" ? StyleSheet.hairlineWidth : 0, borderColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}
    >
      <View>
        <Icon name={icon} size={size * 0.5} color={fg} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
});
