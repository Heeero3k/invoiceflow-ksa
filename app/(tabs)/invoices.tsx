import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { formatDate, formatSar, useInvoices, type Invoice } from "@/lib/invoice-context";

export default function InvoicesScreen() {
  const colors = useColors();
  const { invoices } = useInvoices();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => invoices.filter((invoice) => `${invoice.vendorName} ${invoice.invoiceNumber} ${invoice.projectName}`.toLowerCase().includes(query.toLowerCase())), [invoices, query]);
  const reviewed = invoices.filter((invoice) => invoice.status === "reviewed").length;

  return (
    <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<View>
          <View style={styles.header}><View><Text style={[styles.kicker, { color: colors.primary }]}>سجل العمل</Text><Text style={[styles.title, { color: colors.foreground }]}>الفواتير</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{reviewed} موثقة · {invoices.length - reviewed} تحتاج مراجعة</Text></View><Pressable onPress={() => router.push("/scan")} style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}><IconSymbol name="plus.circle.fill" color="#FFFFFF" size={21} /></Pressable></View>
          <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}><IconSymbol name="magnifyingglass" color={colors.muted} size={19} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم المورد أو رقم الفاتورة" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.foreground }]} /></View>
          <View style={styles.summaryRow}><View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryLabel, { color: colors.muted }]}>إجمالي السجل</Text><Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatSar(invoices.reduce((sum, item) => sum + item.total, 0))}</Text></View><View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.summaryLabel, { color: colors.muted }]}>ضريبة VAT</Text><Text style={[styles.summaryValue, { color: colors.foreground }]}>{formatSar(invoices.reduce((sum, item) => sum + item.vat, 0))}</Text></View></View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>كل الفواتير</Text>
        </View>}
        renderItem={({ item }) => <InvoiceCard invoice={item} colors={colors} />}
        ListEmptyComponent={<View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><IconSymbol name="doc.text.fill" color={colors.muted} size={26} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{query ? "لا توجد نتائج" : "سجلك جاهز للفاتورة الأولى"}</Text><Text style={[styles.emptyCopy, { color: colors.muted }]}>{query ? "جرّب كلمة بحث مختلفة." : "التقط فاتورة أو استورد صورة لبدء التحليل."}</Text></View>}
      />
    </ScreenContainer>
  );
}

function InvoiceCard({ invoice, colors }: { invoice: Invoice; colors: ReturnType<typeof useColors> }) {
  const needsReview = invoice.status === "needs-review";
  return <Pressable onPress={() => router.push("/scan")} style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}><View style={[styles.cardIcon, { backgroundColor: needsReview ? "#FFF4DD" : "#E8F6F1" }]}><IconSymbol name="doc.text.fill" color={needsReview ? "#D98C18" : colors.primary} size={21} /></View><View style={styles.cardBody}><Text style={[styles.vendor, { color: colors.foreground }]} numberOfLines={1}>{invoice.vendorName || "مورد غير معروف"}</Text><Text style={[styles.meta, { color: colors.muted }]}>{invoice.invoiceNumber || "رقم غير متوفر"} · {formatDate(invoice.issueDate)}</Text><View style={styles.tagRow}><View style={[styles.tag, { backgroundColor: needsReview ? "#FFF4DD" : "#E8F6F1" }]}><Text style={[styles.tagText, { color: needsReview ? "#B67511" : colors.success }]}>{needsReview ? "تحتاج مراجعة" : "موثقة"}</Text></View><Text style={[styles.source, { color: colors.muted }]}>{invoice.source === "camera" ? "كاميرا" : invoice.source === "pdf" ? "PDF" : "صورة"}</Text></View></View><View style={styles.amountBox}><Text style={[styles.amount, { color: colors.foreground }]}>{formatSar(invoice.total)}</Text><Text style={[styles.confidence, { color: invoice.confidence >= 0.82 ? colors.success : "#D98C18" }]}>{Math.round(invoice.confidence * 100)}% دقة</Text></View></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  title: { fontSize: 28, fontWeight: "800", marginTop: 3 },
  subtitle: { fontSize: 12, marginTop: 4 },
  addButton: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  search: { height: 48, borderWidth: 1, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 13, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 12, textAlign: "right" },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  summary: { flex: 1, borderWidth: 1, borderRadius: 15, padding: 13 },
  summaryLabel: { fontSize: 11 },
  summaryValue: { fontSize: 15, fontWeight: "800", marginTop: 7 },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 9 },
  cardIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1 },
  vendor: { fontSize: 13, fontWeight: "800" },
  meta: { fontSize: 11, marginTop: 5 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  tag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontSize: 9, fontWeight: "800" },
  source: { fontSize: 10 },
  amountBox: { alignItems: "flex-end" },
  amount: { fontSize: 12, fontWeight: "800" },
  confidence: { fontSize: 10, fontWeight: "700", marginTop: 5 },
  empty: { borderWidth: 1, borderRadius: 17, padding: 26, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "800", marginTop: 10 },
  emptyCopy: { fontSize: 12, marginTop: 6 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
