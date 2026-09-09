import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, Platform, Text, type StyleProp, type TextStyle } from "react-native";

const MAPPING = {
  "house.fill": "home",
  "doc.text.fill": "receipt-long",
  viewfinder: "document-scanner",
  "chart.bar.fill": "bar-chart",
  "gearshape.fill": "settings",
  "arrow.up.right.square": "open-in-new",
  "plus.circle.fill": "add-circle",
  magnifyingglass: "search",
  "bell.fill": "notifications-none",
  "chevron.right": "chevron-right",
  "checkmark.circle.fill": "check-circle",
  "clock.fill": "schedule",
  "icloud.and.arrow.up.fill": "cloud-upload",
  tablecells: "table-view",
  "person.crop.circle": "account-circle",
  "questionmark.circle": "help-outline",
  "lock.fill": "lock",
} as const;

const GLYPHS: Record<keyof typeof MAPPING, string> = {
  "house.fill": "⌂",
  "doc.text.fill": "▤",
  viewfinder: "◎",
  "chart.bar.fill": "▥",
  "gearshape.fill": "⚙",
  "arrow.up.right.square": "↗",
  "plus.circle.fill": "+",
  magnifyingglass: "⌕",
  "bell.fill": "◌",
  "chevron.right": "›",
  "checkmark.circle.fill": "✓",
  "clock.fill": "◷",
  "icloud.and.arrow.up.fill": "↑",
  tablecells: "▦",
  "person.crop.circle": "○",
  "questionmark.circle": "?",
  "lock.fill": "⌑",
};

type IconSymbolName = keyof typeof MAPPING;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  if (Platform.OS === "web") {
    return <Text style={[{ color, fontSize: size, lineHeight: size, textAlign: "center" }, style]}>{GLYPHS[name]}</Text>;
  }
  return <MaterialIcons color={color} size={size} name={MAPPING[name] as ComponentProps<typeof MaterialIcons>["name"]} style={style} />;
}
