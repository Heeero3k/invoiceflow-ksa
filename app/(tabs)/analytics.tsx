import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { formatSar, useInvoices } from "@/lib/invoice-context";

export default function AnalyticsScreen() {
  const colors = useColors();
  const { invoices } = useInvoices();
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const maxVendor = useMemo(() => Math.max(...invoices.map((item) => item.total), 1), [invoices]);
  const vendors = useMemo(() => {
    const grouped = invoices.reduce<Record<string, number>>((acc, item) => { const key = item.vendorName || "مورد غير معروف"; acc[key] = (acc[key] || 0) + item.total; return acc; }, {});
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [invoices]);
  const projects = useMemo(() => {
    const grouped = invoices.reduce<Record<string, number>>((acc, item) => { const key = item.projectName || "غير مصنف"; acc[key] = (acc[key] || 0) + item.total; return acc; }, {});
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [invoices]);

  return <ScreenContainer className="px-5 pt-4" edges={["top", "left", "right"]}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}><Text style={[styles.kicker, { color: colors.primary }]}>رؤية مالية أوضح</Text><Text style={[styles.title, { color: colors.foreground }]}>التحليلات</Text><Text style={[styles.subtitle, { color: colors.muted }]}>ملخص الإنفاق من الفواتير المحفوظة على هذا الجهاز.</Text><View style={[styles.totalCard, { backgroundColor: colors.foreground }]}><View><Text style={styles.totalLabel}>إجمالي المصروفات</Text><Text style={styles.totalValue}>{formatSar(total)}</Text><Text style={styles.totalMeta}>{invoices.length} فاتورة · العملة SAR</Text></View><View style={styles.totalIcon}><IconSymbol name="chart.bar.fill" color={colors.background} size={28} /></View></View><Section title="حسب المورد" subtitle="أعلى الجهات تكلفة" colors={colors}>{vendors.length ? vendors.map(([name, value]) => <BarRow key={name} name={name} value={value} max={maxVendor} colors={colors} />) : <EmptyLine text="ستظهر المقارنة بعد إضافة الفواتير." colors={colors} />}</Section><Section title="حسب المشروع أو الموقع" subtitle="توزيع التكاليف" colors={colors}>{projects.length ? projects.map(([name, value]) => <BarRow key={name} name={name} value={value} max={Math.max(...projects.map((item) => item[1]), 1)} colors={colors} />) : <EmptyLine text="أضف اسم المشروع عند مراجعة الفاتورة." colors={colors} />}</Section><View style={[styles.note, { backgroundColor: "#FFF4DD" }]}><IconSymbol name="questionmark.circle" color="#B67511" size={20} /><Text style={styles.noteText}>التحليلات محلية الآن. عند ربط حسابك، ستتم مزامنة السجل عبر أجهزتك.</Text></View></ScrollView></ScreenContainer>;
}

function Section({ title, subtitle, children, colors }: { title: string; subtitle: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) { return <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.sectionSubtitle, { color: colors.muted }]}>{subtitle}</Text><View style={styles.sectionBody}>{children}</View></View>; }
function BarRow({ name, value, max, colors }: { name: string; value: number; max: number; colors: ReturnType<typeof useColors> }) { return <View style={styles.barRow}><View style={styles.barLabels}><Text style={[styles.barName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text><Text style={[styles.barValue, { color: colors.muted }]}>{formatSar(value)}</Text></View><View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max((value / max) * 100, 7)}%` }]} /></View></View>; }
function EmptyLine({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) { return <Text style={[styles.empty, { color: colors.muted }]}>{text}</Text>; }

const styles = StyleSheet.create({ content: { paddingBottom: 32 }, kicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }, title: { fontSize: 28, fontWeight: "800", marginTop: 3 }, subtitle: { fontSize: 12, lineHeight: 19, marginTop: 4, marginBottom: 18 }, totalCard: { borderRadius: 21, padding: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }, totalLabel: { color: "#C8E9E0", fontSize: 12 }, totalValue: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 7 }, totalMeta: { color: "#C8E9E0", fontSize: 11, marginTop: 5 }, totalIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.13)", alignItems: "center", justifyContent: "center" }, section: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 13 }, sectionTitle: { fontSize: 15, fontWeight: "800" }, sectionSubtitle: { fontSize: 11, marginTop: 3 }, sectionBody: { marginTop: 17 }, barRow: { marginBottom: 15 }, barLabels: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 7 }, barName: { flex: 1, fontSize: 12, fontWeight: "700" }, barValue: { fontSize: 11 }, track: { height: 8, borderRadius: 4, overflow: "hidden" }, fill: { height: 8, borderRadius: 4 }, empty: { fontSize: 12, lineHeight: 19 }, note: { borderRadius: 15, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }, noteText: { flex: 1, fontSize: 11, color: "#8A5C0D", lineHeight: 17 } });
