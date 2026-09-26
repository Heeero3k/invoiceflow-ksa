import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { formatSar, useInvoices } from "@/lib/invoice-context";
import { startOAuthLogin } from "@/constants/oauth";
import { toInvoiceCsv } from "@/shared/invoice-utils";
import { connectGoogleSheets, exportInvoicesToGoogleSheets, getGoogleSheetsStatus } from "@/lib/google-sheets";

export default function SettingsScreen() {
  const colors = useColors();
  const { invoices, clearInvoices } = useInvoices();
  const { user, isAuthenticated, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sheetsConnected, setSheetsConnected] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);

  const login = async () => {
    try {
      await startOAuthLogin();
    } catch (error) {
      Alert.alert("تسجيل الدخول غير متاح", error instanceof Error ? error.message : "تعذر بدء تسجيل الدخول.");
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setSheetsConnected(false);
      setSpreadsheetUrl(null);
      return;
    }
    getGoogleSheetsStatus().then((status) => {
      setSheetsConnected(status.connected);
      setSpreadsheetUrl(status.spreadsheetUrl);
    }).catch(() => undefined);
  }, [isAuthenticated]);

  const exportCsv = async () => {
    setBusy(true);
    try {
      const csv = toInvoiceCsv(invoices);
      if (Platform.OS === "web") {
        await Share.share({ message: csv, title: "InvoiceFlow KSA CSV" });
      } else {
        const uri = `${FileSystem.documentDirectory}invoiceflow-${Date.now()}.csv`;
        await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "تصدير الفواتير" });
      }
    } catch {
      Alert.alert("تعذر التصدير", "حاول مرة أخرى أو تحقق من صلاحيات مشاركة الملفات.");
    } finally {
      setBusy(false);
    }
  };

  const connectSheets = async () => {
    try {
      await connectGoogleSheets();
    } catch (error) {
      Alert.alert("تعذر ربط Google Sheets", error instanceof Error ? error.message : "سجّل الدخول أولاً ثم حاول مرة أخرى.");
    }
  };

  const exportToSheets = async () => {
    setBusy(true);
    try {
      const result = await exportInvoicesToGoogleSheets(invoices);
      setSheetsConnected(true);
      setSpreadsheetUrl(result.spreadsheetUrl);
      Alert.alert("تم التصدير تلقائياً", "أضيفت الفواتير إلى جدول Google Sheets المرتبط.", [{ text: "فتح الجدول", onPress: () => Linking.openURL(result.spreadsheetUrl) }, { text: "حسناً" }]);
    } catch (error) {
      Alert.alert("تعذر التصدير إلى Google Sheets", "اربط حساب Google أولاً ثم أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  };

  const confirmClear = () => Alert.alert("حذف السجل المحلي؟", "سيتم حذف الفواتير المحفوظة على هذا الجهاز فقط.", [{ text: "إلغاء", style: "cancel" }, { text: "حذف", style: "destructive", onPress: clearInvoices }]);

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><Text style={[styles.kicker, { color: colors.primary }]}>مساحتك الآمنة</Text><Text style={[styles.title, { color: colors.foreground }]}>الإعدادات</Text><Text style={[styles.subtitle, { color: colors.muted }]}>تحكم في الحساب، التصدير، وخصوصية الفواتير.</Text><View style={[styles.profile, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.profileAvatar, { backgroundColor: colors.primary }]}><Text style={styles.profileLetter}>{user?.name?.charAt(0) ?? "م"}</Text></View><View style={styles.profileBody}><Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name ?? "وضع الضيف"}</Text><Text style={[styles.profileEmail, { color: colors.muted }]}>{user?.email ?? "سجّل الدخول لحفظ السجل سحابياً"}</Text></View>{isAuthenticated ? <Pressable onPress={logout}><Text style={[styles.link, { color: colors.primary }]}>خروج</Text></Pressable> : <Pressable onPress={login}><Text style={[styles.link, { color: colors.primary }]}>دخول</Text></Pressable>}</View><Text style={[styles.sectionTitle, { color: colors.foreground }]}>التصدير والمزامنة</Text><ActionRow icon="tablecells" title="تصدير إلى Excel / CSV" copy={`${invoices.length} فاتورة · ${formatSar(invoices.reduce((sum, item) => sum + item.total, 0))}`} colors={colors} onPress={exportCsv} disabled={busy} /><ActionRow icon="icloud.and.arrow.up.fill" title={sheetsConnected ? "تصدير تلقائي إلى Google Sheets" : "ربط Google Sheets"} copy={sheetsConnected ? "الحساب مرتبط؛ اضغط لإضافة الفواتير الآن" : isAuthenticated ? "OAuth آمن ثم إنشاء جدول الفواتير تلقائياً" : "سجّل الدخول بحساب Google أولاً"} colors={colors} onPress={isAuthenticated ? (sheetsConnected ? exportToSheets : connectSheets) : login} disabled={busy} /><ActionRow icon="arrow.up.right.square" title="فتح جدول Google المرتبط" copy={spreadsheetUrl ? "عرض آخر جدول تم التصدير إليه" : isAuthenticated ? "سيظهر الرابط بعد أول تصدير" : "سجّل الدخول بحساب Google أولاً"} colors={colors} onPress={() => !isAuthenticated ? login() : spreadsheetUrl ? Linking.openURL(spreadsheetUrl) : connectSheets()} disabled={busy} /><Text style={[styles.sectionTitle, { color: colors.foreground }]}>الخصوصية</Text><View style={[styles.privacy, { backgroundColor: "#E8F6F1" }]}><IconSymbol name="lock.fill" size={20} color={colors.primary} /><View style={styles.flex}><Text style={[styles.privacyTitle, { color: colors.foreground }]}>بياناتك تحت سيطرتك</Text><Text style={[styles.privacyCopy, { color: colors.muted }]}>المعالجة تبدأ محلياً، ولا يتم إرسال الصورة لخادم الذكاء الاصطناعي إلا عند طلب التحليل.</Text></View></View><Pressable onPress={confirmClear} style={({ pressed }) => [styles.deleteButton, { borderColor: colors.border }, pressed && styles.pressed]}><Text style={[styles.deleteText, { color: colors.error }]}>حذف الفواتير من هذا الجهاز</Text></Pressable><Text style={[styles.version, { color: colors.muted }]}>InvoiceFlow KSA · الإصدار 1.0.1</Text></ScrollView></ScreenContainer>;
}

function ActionRow({ icon, title, copy, colors, onPress, disabled }: { icon: "tablecells" | "icloud.and.arrow.up.fill" | "arrow.up.right.square"; title: string; copy: string; colors: ReturnType<typeof useColors>; onPress: () => void; disabled?: boolean }) { return <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.action, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && { opacity: 0.55 }, pressed && styles.pressed]}><View style={[styles.actionIcon, { backgroundColor: "#E8F6F1" }]}><IconSymbol name={icon} color={colors.primary} size={20} /></View><View style={styles.flex}><Text style={[styles.actionTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.actionCopy, { color: colors.muted }]}>{copy}</Text></View><IconSymbol name="chevron.right" color={colors.muted} size={19} /></Pressable>; }

const styles = StyleSheet.create({ content: { paddingBottom: 34 }, kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }, title: { fontSize: 28, fontWeight: "800", marginTop: 3 }, subtitle: { fontSize: 12, lineHeight: 19, marginTop: 4, marginBottom: 18 }, profile: { borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", marginBottom: 24 }, profileAvatar: { width: 45, height: 45, borderRadius: 15, alignItems: "center", justifyContent: "center" }, profileLetter: { color: "#FFFFFF", fontSize: 19, fontWeight: "800" }, profileBody: { flex: 1, marginLeft: 11 }, profileName: { fontSize: 14, fontWeight: "800" }, profileEmail: { fontSize: 10, marginTop: 4 }, link: { fontSize: 12, fontWeight: "800" }, sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 10, marginTop: 2 }, action: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 }, actionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" }, flex: { flex: 1 }, actionTitle: { fontSize: 13, fontWeight: "800" }, actionCopy: { fontSize: 10, marginTop: 5 }, privacy: { borderRadius: 16, padding: 14, flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 14 }, privacyTitle: { fontSize: 13, fontWeight: "800" }, privacyCopy: { fontSize: 11, lineHeight: 17, marginTop: 5 }, deleteButton: { borderWidth: 1, borderRadius: 14, height: 46, alignItems: "center", justifyContent: "center" }, deleteText: { fontSize: 12, fontWeight: "800" }, version: { textAlign: "center", fontSize: 10, marginTop: 22 }, pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] } });
