import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InlineBanner } from "@/components/ads/banner";
import { BatchCard, InvoiceRow } from "@/components/invoice-row";
import { Button, IconButton } from "@/components/ui/button";
import { ChipScroller, Field } from "@/components/ui/field";
import { EmptyState, PageHeader, Row, Screen, Segmented } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { confirmAction } from "@/lib/dialogs";
import { useI18n } from "@/lib/i18n";
import { setExportSelection } from "@/lib/selection";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from "@/shared/invoice";

type StatusFilter = "all" | "needs-review" | "approved";

export default function InvoicesScreen() {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const { invoices, batches, jobs, approveInvoices, deleteInvoices, addManualInvoice } = useStore();
  const [view, setView] = useState<"invoices" | "batches">("invoices");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selecting = selected.size > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (status !== "all" && invoice.status !== status) return false;
      if (category !== "all" && invoice.category !== category) return false;
      if (!q) return true;
      return [invoice.vendorName, invoice.invoiceNumber, invoice.projectName, invoice.vendorTaxId, invoice.notes].some((value) => value.toLowerCase().includes(q));
    });
  }, [category, invoices, query, status]);

  const usedCategories = useMemo(() => CATEGORY_KEYS.filter((key) => invoices.some((invoice) => invoice.category === key)), [invoices]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const header = (
    <View>
      <PageHeader
        title={t("invoicesTitle")}
        subtitle={t("invoicesCount", { n: invoices.length })}
        right={
          <IconButton
            icon="plus"
            label={t("addManually")}
            onPress={() => {
              const invoice = addManualInvoice(null);
              router.push(`/invoice/${invoice.id}`);
            }}
          />
        }
      />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "invoices", label: t("viewInvoices") },
          { value: "batches", label: t("viewBatches") },
        ]}
      />
      {view === "invoices" ? (
        <View style={{ marginTop: 14 }}>
          <Field label="" placeholder={t("searchPlaceholder")} value={query} onChangeText={setQuery} icon="magnify" returnKeyType="search" />
          <ChipScroller<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: t("all") },
              { value: "needs-review", label: t("statusNeedsReview"), icon: "alert-circle-outline" },
              { value: "approved", label: t("statusApproved"), icon: "check-decagram-outline" },
            ]}
          />
          {usedCategories.length > 1 ? (
            <View style={{ marginTop: 8 }}>
              <ChipScroller<CategoryKey | "all">
                value={category}
                onChange={setCategory}
                options={[{ value: "all", label: t("filterCategory") }, ...usedCategories.map((key) => ({ value: key, label: CATEGORY_LABELS[key][language], icon: CATEGORY_LABELS[key].icon }))]}
              />
            </View>
          ) : null}
          <View style={{ height: 14 }} />
        </View>
      ) : (
        <View style={{ height: 14 }} />
      )}
    </View>
  );

  return (
    <Screen>
      {view === "invoices" ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: selecting ? 180 : 120 }}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <InvoiceRow
              invoice={item}
              selecting={selecting}
              selected={selected.has(item.id)}
              onLongPress={() => toggle(item.id)}
              onPress={() => (selecting ? toggle(item.id) : router.push(`/invoice/${item.id}`))}
            />
          )}
          ListEmptyComponent={<EmptyState icon="file-search-outline" title={invoices.length ? t("noResults") : t("noInvoicesTitle")} body={invoices.length ? undefined : t("noInvoicesBody")} />}
          ListFooterComponent={filtered.length > 4 ? <InlineBanner /> : null}
        />
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          ListHeaderComponent={header}
          renderItem={({ item }) => (
            <BatchCard
              batch={item}
              invoices={invoices.filter((invoice) => invoice.batchId === item.id)}
              processing={jobs.filter((job) => job.batchId === item.id && job.status !== "failed").length}
              onPress={() => router.push(`/batch/${item.id}`)}
            />
          )}
          ListEmptyComponent={<EmptyState icon="folder-outline" title={t("noInvoicesTitle")} body={t("noInvoicesBody")} />}
        />
      )}

      {selecting ? (
        <View style={[styles.actionBar, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 64 }]}>
          <Row style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <Text variant="subheading">{t("selectedCount", { n: selected.size })}</Text>
            <Button title={t("cancel")} variant="ghost" size="sm" full={false} onPress={() => setSelected(new Set())} />
          </Row>
          <Row gap={8}>
            <Button
              title={t("approveSelected")}
              icon="check-all"
              variant="secondary"
              size="md"
              style={{ flex: 1 }}
              onPress={() => {
                approveInvoices([...selected]);
                setSelected(new Set());
              }}
            />
            <Button
              title={t("exportSelected")}
              icon="microsoft-excel"
              size="md"
              style={{ flex: 1 }}
              onPress={() => {
                setExportSelection([...selected]);
                setSelected(new Set());
                router.push({ pathname: "/export", params: { scope: "selection" } });
              }}
            />
            <IconButton
              icon="trash-can-outline"
              tone="danger"
              size={46}
              label={t("deleteSelected")}
              onPress={() =>
                confirmAction(t("deleteInvoicesConfirm", { n: selected.size }), t("delete"), t("cancel"), () => {
                  deleteInvoices([...selected]);
                  setSelected(new Set());
                })
              }
            />
          </Row>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
});
