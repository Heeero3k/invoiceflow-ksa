import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs, router } from "expo-router";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useI18n } from "@/lib/i18n";
import type { StringKey } from "@/lib/strings";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const TABS: { name: string; label: StringKey; icon: string; activeIcon: string }[] = [
  { name: "index", label: "tabHome", icon: "home-outline", activeIcon: "home" },
  { name: "invoices", label: "tabInvoices", icon: "file-document-multiple-outline", activeIcon: "file-document-multiple" },
  { name: "exports", label: "tabExports", icon: "cloud-upload-outline", activeIcon: "cloud-upload" },
  { name: "settings", label: "tabSettings", icon: "cog-outline", activeIcon: "cog" },
];

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { t, row } = useI18n();
  const insets = useSafeAreaInsets();
  const { invoices } = useStore();
  const reviewCount = invoices.filter((invoice) => invoice.status === "needs-review").length;
  const activeName = state.routes[state.index]?.name;

  const items = TABS.map((tab) => {
    const active = activeName === tab.name;
    return (
      <Pressable
        key={tab.name}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t(tab.label)}
        onPress={() => {
          haptic();
          if (!active) navigation.navigate(tab.name);
        }}
        style={styles.item}
      >
        <View>
          <Icon name={active ? tab.activeIcon : tab.icon} size={23} color={active ? colors.text : colors.textFaint} />
          {tab.name === "invoices" && reviewCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
              <Text style={styles.badgeText} align="center">
                {reviewCount > 99 ? "99+" : reviewCount}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="caption" style={{ fontSize: 10.5, color: active ? colors.text : colors.textFaint }} align="center">
          {t(tab.label)}
        </Text>
      </Pressable>
    );
  });

  const scanButton = (
    <View key="scan" style={styles.item}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("tabScan")}
        onPress={() => {
          haptic();
          router.push("/scan");
        }}
        style={({ pressed }) => [styles.scan, { backgroundColor: colors.primary, shadowColor: colors.ink }, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <Icon name="line-scan" size={26} color={colors.onPrimary} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 10 : 8), flexDirection: row }]}>
      {[items[0], items[1], scanButton, items[2], items[3]]}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="exports" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, alignItems: "center" },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  scan: { width: 58, height: 58, borderRadius: 21, alignItems: "center", justifyContent: "center", marginTop: -26, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  badge: { position: "absolute", top: -5, right: -11, minWidth: 18, height: 18, borderRadius: 9, borderWidth: 2, paddingHorizontal: 3, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#FFFFFF", fontSize: 9.5, lineHeight: 12, fontWeight: "700" },
});
