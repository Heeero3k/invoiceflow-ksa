import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useI18n } from "@/lib/i18n";
import { radius, useTheme } from "@/lib/theme";
import { CATEGORY_LABELS, type Batch, type Invoice } from "@/shared/invoice";

export function InvoiceRow({ invoice, onPress, onLongPress, selected, selecting }: { invoice: Invoice; onPress: () => void; onLongPress?: () => void; selected?: boolean; selecting?: boolean }) {
  const { colors } = useTheme();
  const { row, formatMoney, formatDate, t, categoryLabel } = useI18n();
  const needsReview = invoice.status === "needs-review";
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        { flexDirection: row, backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.border },
        pressed && { opacity: 0.85 },
      ]}
    >
      {selecting ? (
        <Icon name={selected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={22} color={selected ? colors.accent : colors.textFaint} />
      ) : (
        <View style={[styles.icon, { backgroundColor: needsReview ? colors.warningSoft : colors.surfaceAlt }]}>
          <Icon name={CATEGORY_LABELS[invoice.category].icon} size={19} color={needsReview ? colors.warning : colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {invoice.vendorName || t("unknownVendor")}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[invoice.issueDate ? formatDate(invoice.issueDate) : null, categoryLabel(invoice.category), invoice.projectName || null].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <View style={{ alignItems: row === "row" ? "flex-end" : "flex-start", gap: 4 }}>
        <Text variant="number" style={{ fontSize: 14 }}>
          {formatMoney(invoice.total, false)}
        </Text>
        {needsReview ? (
          <View style={[styles.pill, { backgroundColor: colors.warningSoft }]}>
            <Text style={{ fontSize: 10, color: colors.warning }} variant="caption">
              {t("statusNeedsReview")}
            </Text>
          </View>
        ) : (
          <Icon name="check-decagram" size={15} color={colors.success} />
        )}
      </View>
    </Pressable>
  );
}

export function BatchCard({ batch, invoices, processing, onPress }: { batch: Batch; invoices: Invoice[]; processing: number; onPress: () => void }) {
  const { colors } = useTheme();
  const { row, formatMoney, formatShortDate, t, chevronForward } = useI18n();
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const review = invoices.filter((invoice) => invoice.status === "needs-review").length;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.batch, { flexDirection: row, backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.88 }]}>
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Icon name={batch.exportedAt ? "folder-check-outline" : "folder-outline"} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {batch.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {[formatShortDate(batch.createdAt), t("invoicesCount", { n: invoices.length + processing }), processing ? t("processing") : review ? `${review} ${t("toReview")}` : null].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text variant="number" style={{ fontSize: 14 }}>
        {formatMoney(total, false)}
      </Text>
      <Icon name={chevronForward} size={20} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", gap: 12, padding: 12, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  batch: { alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill },
});
