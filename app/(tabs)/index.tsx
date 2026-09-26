import { useMemo } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatSar, useInvoices, type Invoice } from "@/lib/invoice-context";
import { startOAuthLogin } from "@/constants/oauth";
import { InvoiceBannerAd } from "@/components/invoice-banner-ad";

export default function HomeScreen() {
  const colors = useColors();
  const { invoices } = useInvoices();
  const { user, isAuthenticated } = useAuth();
  const total = useMemo(() => invoices.reduce((sum, invoice) => sum + invoice.total, 0), [invoices]);
  const vat = useMemo(() => invoices.reduce((sum, invoice) => sum + invoice.vat, 0), [invoices]);
  const pending = invoices.filter((invoice) => invoice.status === "needs-review").length;

  const login = async () => {
    try {
      await startOAuthLogin();
    } catch (error) {
      Alert.alert("تسجيل الدخول غير متاح", error instanceof Error ? error.message : "تعذر بدء تسجيل الدخول.");
    }
  };

  const statCards = [
    { label: "فواتير هذا الشهر", value: String(invoices.length), icon: "doc.text.fill" as const, tone: colors.primary },
    { label: "إجمالي المصروفات", value: formatSar(total), icon: "chart.bar.fill" as const, tone: colors.success },
    { label: "ضريبة القيمة المضافة", value: formatSar(vat), icon: "tablecells" as const, tone: "#D98C18" },
  ];

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <FlatList
        data={invoices.slice(0, 3)}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.headerRow}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>INVOICEFLOW KSA</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>مرحباً {user?.name?.split(" ")[0] ?? "بك"}</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>رتّب فواتيرك في ثوانٍ، بدون إدخال يدوي.</Text>
              </View>
              <Pressable onPress={() => router.push("/settings")} style={({ pressed }) => [styles.avatar, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={styles.avatarText}>{user?.name?.charAt(0) ?? "م"}</Text>
              </Pressable>
            </View>

            {!isAuthenticated && (
              <Pressable onPress={login} style={({ pressed }) => [styles.signInBanner, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
                <View style={[styles.googleBadge, { backgroundColor: "#EAF4F1" }]}><Text style={styles.googleText}>G</Text></View>
                <View style={styles.flexOne}><Text style={[styles.bannerTitle, { color: colors.foreground }]}>سجّل الدخول بحساب Google</Text><Text style={[styles.bannerCopy, { color: colors.muted }]}>لمزامنة الفواتير وحماية بياناتك</Text></View>
                <IconSymbol name="chevron.right" size={20} color={colors.muted} />
              </Pressable>
            )}

            <View style={[styles.heroCard, { backgroundColor: colors.primary }]}>
              <View style={styles.heroGlow} />
              <View style={styles.heroText}>
                <Text style={styles.heroKicker}>المساعد الذكي للفواتير</Text>
                <Text style={styles.heroTitle}>صوّر. راجع. صدّر.</Text>
                <Text style={styles.heroCopy}>تحليل عربي/إنجليزي للضريبة والإجمالي وبيانات المورد تلقائياً.</Text>
              </View>
              <View style={styles.heroIcon}><IconSymbol name="viewfinder" size={34} color="#FFFFFF" /></View>
            </View>

            <Pressable onPress={() => router.push("/scan")} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.foreground }, pressed && styles.pressed]}>
              <IconSymbol name="plus.circle.fill" size={22} color={colors.background} />
              <Text style={[styles.primaryButtonText, { color: colors.background }]}>مسح فاتورة جديدة</Text>
            </Pressable>

            <View style={styles.statsGrid}>
              {statCards.map((stat) => (
                <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.statIcon, { backgroundColor: `${stat.tone}18` }]}><IconSymbol name={stat.icon} size={18} color={stat.tone} /></View>
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.muted }]}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <InvoiceBannerAd />

            <View style={styles.sectionHeader}>
              <View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>آخر الفواتير</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{pending ? `${pending} بانتظار المراجعة` : "كل شيء مرتب"}</Text></View>
              <Pressable onPress={() => router.push("/invoices")}><Text style={[styles.seeAll, { color: colors.primary }]}>عرض الكل</Text></Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <RecentInvoice invoice={item} colors={colors} />}
        ListEmptyComponent={<View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><IconSymbol name="doc.text.fill" size={22} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>لم تضف أي فاتورة بعد</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>ابدأ بالتقاط أول فاتورة وسيقوم InvoiceFlow بترتيبها لك.</Text></View>}
      />
    </ScreenContainer>
  );
}

function RecentInvoice({ invoice, colors }: { invoice: Invoice; colors: ReturnType<typeof useColors> }) {
  return <Pressable onPress={() => router.push("/invoices")} style={({ pressed }) => [styles.invoiceRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
    <View style={[styles.invoiceIcon, { backgroundColor: invoice.status === "needs-review" ? "#FFF4DD" : "#E8F6F1" }]}><IconSymbol name="doc.text.fill" size={20} color={invoice.status === "needs-review" ? "#D98C18" : colors.primary} /></View>
    <View style={styles.flexOne}><Text style={[styles.invoiceName, { color: colors.foreground }]} numberOfLines={1}>{invoice.vendorName || "مورد غير معروف"}</Text><Text style={[styles.invoiceMeta, { color: colors.muted }]}>{invoice.invoiceNumber || "رقم غير متوفر"} · {formatDate(invoice.issueDate)}</Text></View>
    <View style={styles.invoiceAmount}><Text style={[styles.amount, { color: colors.foreground }]}>{formatSar(invoice.total)}</Text><Text style={[styles.status, { color: invoice.status === "needs-review" ? "#D98C18" : colors.success }]}>{invoice.status === "needs-review" ? "مراجعة" : "موثقة"}</Text></View>
  </Pressable>;
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 32 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, marginBottom: 6 },
  title: { fontSize: 27, fontWeight: "800", lineHeight: 34 },
  subtitle: { fontSize: 13, marginTop: 4, lineHeight: 20 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  signInBanner: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 12, marginBottom: 16 },
  googleBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  googleText: { fontSize: 17, fontWeight: "800", color: "#087F6B" },
  bannerTitle: { fontSize: 13, fontWeight: "800" },
  bannerCopy: { fontSize: 11, marginTop: 3 },
  heroCard: { minHeight: 158, borderRadius: 24, padding: 22, flexDirection: "row", alignItems: "center", overflow: "hidden", marginBottom: 12 },
  heroGlow: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.09)", right: -60, top: -80 },
  heroText: { flex: 1, paddingRight: 12 },
  heroKicker: { color: "#BEEFE1", fontSize: 12, fontWeight: "700", marginBottom: 8 },
  heroTitle: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", lineHeight: 32 },
  heroCopy: { color: "#DDF7EF", fontSize: 12, lineHeight: 19, marginTop: 8 },
  heroIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  primaryButton: { borderRadius: 15, height: 53, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 18 },
  primaryButtonText: { fontSize: 15, fontWeight: "800" },
  statsGrid: { flexDirection: "row", gap: 9, marginBottom: 26 },
  statCard: { flex: 1, minHeight: 116, borderRadius: 17, borderWidth: 1, padding: 12 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 9 },
  statValue: { fontSize: 16, fontWeight: "800" },
  statLabel: { fontSize: 10, lineHeight: 15, marginTop: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "800" },
  sectionSubtitle: { fontSize: 11, marginTop: 3 },
  seeAll: { fontSize: 12, fontWeight: "800" },
  invoiceRow: { minHeight: 75, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 },
  invoiceIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  flexOne: { flex: 1 },
  invoiceName: { fontSize: 13, fontWeight: "800" },
  invoiceMeta: { fontSize: 11, marginTop: 5 },
  invoiceAmount: { alignItems: "flex-end" },
  amount: { fontSize: 12, fontWeight: "800" },
  status: { fontSize: 10, fontWeight: "700", marginTop: 5 },
  emptyCard: { borderWidth: 1, borderRadius: 16, padding: 22, alignItems: "center", marginTop: 2 },
  emptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 9 },
  emptyCopy: { fontSize: 12, textAlign: "center", lineHeight: 19, marginTop: 5 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
