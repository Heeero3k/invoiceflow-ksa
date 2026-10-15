import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import { radius, useTheme } from "@/lib/theme";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

export function Screen({ children, edges = ["top"], style }: { children: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function ScrollScreen({ children, edges = ["top"], contentStyle, ...props }: ScrollViewProps & { children: ReactNode; edges?: Edge[]; contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <Screen edges={edges}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: 120 }, contentStyle]} {...props}>
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Row({ children, style, gap = 10, align = "center" }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; align?: ViewStyle["alignItems"] }) {
  const { row } = useI18n();
  return <View style={[{ flexDirection: row, alignItems: align, gap }, style]}>{children}</View>;
}

export function Card({ children, style, onPress, padded = true, tone = "surface" }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean; tone?: "surface" | "accent" | "warning" | "success" | "danger" | "alt" }) {
  const { colors } = useTheme();
  const bg = { surface: colors.surface, accent: colors.accentSoft, warning: colors.warningSoft, success: colors.successSoft, danger: colors.dangerSoft, alt: colors.surfaceAlt }[tone];
  const content = (
    <View style={[{ backgroundColor: bg, borderRadius: radius.lg, borderWidth: tone === "surface" ? StyleSheet.hairlineWidth : 0, borderColor: colors.border, padding: padded ? 16 : 0 }, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.88, transform: [{ scale: 0.992 }] }}>
      {content}
    </Pressable>
  );
}

export function PageHeader({ title, subtitle, overline, right }: { title: string; subtitle?: string; overline?: string; right?: ReactNode }) {
  const { row } = useI18n();
  return (
    <View style={{ flexDirection: row, alignItems: "flex-end", justifyContent: "space-between", paddingTop: 12, paddingBottom: 18, gap: 12 }}>
      <View style={{ flex: 1 }}>
        {overline ? (
          <Text variant="overline" tone="accent">
            {overline}
          </Text>
        ) : null}
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { row } = useI18n();
  return (
    <View style={{ flexDirection: row, justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 }}>
      <Text variant="heading">{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text variant="label" tone="accent">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "accent"; icon?: IconName | string }) {
  const { colors } = useTheme();
  const { row } = useI18n();
  const palette = {
    neutral: [colors.surfaceAlt, colors.textMuted],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    accent: [colors.accentSoft, colors.accent],
  }[tone];
  return (
    <View style={{ flexDirection: row, alignItems: "center", gap: 4, backgroundColor: palette[0], paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: "flex-start" }}>
      {icon ? <Icon name={icon} size={12} color={palette[1]} /> : null}
      <Text variant="caption" style={{ color: palette[1], fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "success" }) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: "hidden", flexDirection: isRTL ? "row-reverse" : "row" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: tone === "accent" ? colors.accent : colors.success, borderRadius: 3 }} />
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName | string; title: string; body?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 36, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Icon name={icon} size={28} color={colors.accent} />
      </View>
      <Text variant="subheading" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 12, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}

export function ListRow({ icon, title, subtitle, onPress, right, danger, iconTone = "accent" }: { icon?: IconName | string; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean; iconTone?: "accent" | "neutral" }) {
  const { colors } = useTheme();
  const { row, chevronForward } = useI18n();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={({ pressed }) => [{ flexDirection: row, alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16 }, pressed && { backgroundColor: colors.surfaceAlt }]}>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: danger ? colors.dangerSoft : iconTone === "accent" ? colors.accentSoft : colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={19} color={danger ? colors.danger : iconTone === "accent" ? colors.accent : colors.textMuted} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={danger ? "danger" : "default"}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name={chevronForward} size={20} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

export function Divider({ inset = 64 }: { inset?: number }) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: isRTL ? 0 : inset, marginRight: isRTL ? inset : 0 }} />;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  const { colors } = useTheme();
  const { row } = useI18n();
  return (
    <View style={{ flexDirection: row, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3, gap: 3 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onChange(option.value)} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: active ? colors.surface : "transparent", alignItems: "center" }}>
            <Text variant="label" tone={active ? "default" : "muted"} align="center">
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
