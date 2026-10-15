import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function Icon({ name, size = 22, color, style }: { name: IconName | string; size?: number; color: string; style?: StyleProp<TextStyle> }) {
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} style={style} />;
}

export const iconFont = MaterialCommunityIcons.font;
