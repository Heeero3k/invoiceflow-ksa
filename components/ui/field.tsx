import { forwardRef, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { useI18n } from "@/lib/i18n";
import { fonts, radius, useTheme } from "@/lib/theme";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

type FieldProps = Omit<TextInputProps, "style"> & {
  label: string;
  helper?: string;
  error?: string | null;
  warning?: boolean;
  icon?: IconName | string;
  numeric?: boolean;
  ltr?: boolean;
  flex?: number;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, helper, error, warning, icon, numeric, ltr, flex, onFocus, onBlur, ...props }, ref) {
  const { colors } = useTheme();
  const { row, isRTL } = useI18n();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : warning ? colors.warning : focused ? colors.accent : colors.border;
  const forceLtr = ltr || numeric;
  return (
    <View style={{ flex, marginBottom: 14 }}>
      {label ? (
        <Text variant="label" tone={error ? "danger" : "muted"} style={{ marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.box, { flexDirection: row, borderColor, backgroundColor: warning && !focused ? colors.warningSoft : colors.surface }]}>
        {icon ? <Icon name={icon} size={18} color={colors.textFaint} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label || props.placeholder}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          keyboardType={numeric ? "decimal-pad" : props.keyboardType}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            styles.input,
            {
              color: colors.text,
              fontFamily: numeric ? fonts.semibold : fonts.regular,
              textAlign: forceLtr ? (isRTL ? "right" : "left") : isRTL ? "right" : "left",
              writingDirection: forceLtr ? "ltr" : isRTL ? "rtl" : "ltr",
            },
          ]}
          {...props}
        />
      </View>
      {error || helper ? (
        <Text variant="caption" tone={error ? "danger" : "faint"} style={{ marginTop: 4 }}>
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
});

export function ChipScroller<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: string }[]; onChange: (value: T) => void }) {
  const { isRTL } = useI18n();
  const scrollRef = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Native layout is LTR; in Arabic start scrolled to the end so the first chip sits on the right.
      onContentSizeChange={() => isRTL && scrollRef.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ gap: 8, paddingVertical: 2, flexDirection: isRTL ? "row-reverse" : "row" }}
    >
      {options.map((option) => (
        <Chip key={option.value} label={option.label} icon={option.icon} active={option.value === value} onPress={() => onChange(option.value)} />
      ))}
    </ScrollView>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: string }) {
  const { colors } = useTheme();
  const { row } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: row, alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface },
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={active ? colors.onPrimary : colors.textMuted} /> : null}
      <Text variant="label" style={{ color: active ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, alignItems: "center", paddingHorizontal: 12, gap: 8 },
  input: { flex: 1, fontSize: 15, paddingVertical: 10, outlineWidth: 0 } as object,
});
