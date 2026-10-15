import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useI18n } from "@/lib/i18n";
import { fonts, useTheme } from "@/lib/theme";

type Variant = "display" | "title" | "heading" | "subheading" | "body" | "bodyStrong" | "caption" | "label" | "overline" | "number" | "numberLarge";
type Tone = "default" | "muted" | "faint" | "accent" | "success" | "warning" | "danger" | "inverse" | "onPrimary";

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 42 },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 34 },
  heading: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 27 },
  subheading: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  label: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 18 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, letterSpacing: 0.6 },
  number: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, fontVariant: ["tabular-nums"] },
  numberLarge: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 38, fontVariant: ["tabular-nums"] },
};

export type AppTextProps = TextProps & { variant?: Variant; tone?: Tone; align?: "auto" | "start" | "center" | "end" };

export function Text({ variant = "body", tone = "default", align = "start", style, ...props }: AppTextProps) {
  const { colors } = useTheme();
  const { isRTL, writingDirection } = useI18n();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    faint: colors.textFaint,
    accent: colors.accent,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    inverse: colors.background,
    onPrimary: colors.onPrimary,
  }[tone];
  const textAlign: TextStyle["textAlign"] =
    align === "center" ? "center" : align === "auto" ? "auto" : align === "start" ? (isRTL ? "right" : "left") : isRTL ? "left" : "right";
  return <RNText {...props} style={[variants[variant], { color, textAlign, writingDirection }, style]} />;
}
