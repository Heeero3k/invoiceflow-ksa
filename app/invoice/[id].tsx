import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, IconButton, haptic } from "@/components/ui/button";
import { Chip, Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, Loading, Row, Screen } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { confirmAction, notify } from "@/lib/dialogs";
import { useI18n } from "@/lib/i18n";
import type { StringKey } from "@/lib/strings";
import { useStore } from "@/lib/store";
import { radius, useTheme } from "@/lib/theme";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  HIGH_CONFIDENCE,
  VAT_RATE,
  checkAmounts,
  isValidSaudiTaxId,
  missingRequiredFields,
  normalizeDate,
  normalizeDigits,
  parseAmount,
  round2,
  type Invoice,
} from "@/shared/invoice";

const FIELD_KEYS: Record<"vendorName" | "issueDate" | "total", StringKey> = { vendorName: "fieldVendor", issueDate: "fieldDate", total: "fieldTotal" };

export default function InvoiceReviewScreen() {
  const { id, batch } = useLocalSearchParams<{ id: string; batch?: string }>();
  const { colors } = useTheme();
  const { t, row, chevronBack, formatMoney, language } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useStore();
  const invoice = store.invoices.find((item) => item.id === id);
  const [draft, setDraft] = useState<Invoice | null>(invoice ?? null);
  const [amountText, setAmountText] = useState(() => ({
    subtotal: invoice?.subtotal ? String(invoice.subtotal) : "",
    vat: invoice?.vat ? String(invoice.vat) : "",
    total: invoice?.total ? String(invoice.total) : "",
  }));
  const [previewOpen, setPreviewOpen] = useState(false);
  const dirty = useRef(false);

  // The store loads asynchronously; pick the invoice up once it arrives (deep links, reloads).
  useEffect(() => {
    if (draft || !invoice) return;
    setDraft(invoice);
    setAmountText({
      subtotal: invoice.subtotal ? String(invoice.subtotal) : "",
      vat: invoice.vat ? String(invoice.vat) : "",
      total: invoice.total ? String(invoice.total) : "",
    });
  }, [draft, invoice]);

  // Autosave edits so nothing is lost when leaving the screen.
  useEffect(() => {
    if (!draft || !dirty.current) return;
    const timer = setTimeout(() => {
      store.updateInvoice(draft.id, draftPatch(draft));
      dirty.current = false;
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, store]);

  const queue = useMemo(() => {
    if (!batch) return [];
    return store.invoices.filter((item) => item.batchId === batch && (item.status === "needs-review" || item.id === id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [batch, id, store.invoices]);
  const position = queue.findIndex((item) => item.id === id);

  const recentProjects = useMemo(() => {
    const seen = new Set<string>();
    for (const item of store.invoices) {
      if (item.projectName && item.id !== id) seen.add(item.projectName);
      if (seen.size >= 6) break;
    }
    return [...seen];
  }, [id, store.invoices]);

  if (!draft && !store.ready) return <Loading />;
  if (!draft) {
    return (
      <Screen>
        <EmptyState icon="file-remove-outline" title={t("noInvoicesTitle")} action={<Button title={t("back")} variant="secondary" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const set = (patch: Partial<Invoice>) => {
    dirty.current = true;
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };
  const setAmount = (key: "subtotal" | "vat" | "total", text: string) => {
    const clean = normalizeDigits(text).replace(/[^\d.,]/g, "");
    setAmountText((current) => ({ ...current, [key]: clean }));
    set({ [key]: parseAmount(clean) } as Partial<Invoice>);
  };
  const applyAmounts = (patch: Partial<Record<"subtotal" | "vat" | "total", number>>) => {
    setAmountText((current) => ({ ...current, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, String(value)])) }));
    set(patch);
  };

  const amountCheck = checkAmounts(draft);
  const taxIdInvalid = Boolean(draft.vendorTaxId && !isValidSaudiTaxId(draft.vendorTaxId));
  const missing = missingRequiredFields(draft);
  const highConfidence = draft.confidence >= HIGH_CONFIDENCE && draft.source !== "manual";
  const warnings = draft.warnings.map((warning) => (warning.startsWith("#err_") ? t(warning.slice(1) as StringKey) : warning));

  const persist = (status?: Invoice["status"]) => {
    const patch = { ...draftPatch(draft), ...(status ? { status } : {}) };
    store.updateInvoice(draft.id, patch);
    dirty.current = false;
  };

  const goNext = () => {
    const next = queue.find((item, index) => index > position && item.status === "needs-review") ?? queue.find((item) => item.id !== id && item.status === "needs-review");
    if (next) router.replace({ pathname: "/invoice/[id]", params: { id: next.id, batch } });
    else router.back();
  };

  const approve = () => {
    if (missing.length) {
      notify(t("missingFields", { fields: missing.map((key) => t(FIELD_KEYS[key])).join("، ") }));
      return;
    }
    persist("approved");
    haptic("success");
    if (batch) goNext();
    else router.back();
  };

  return (
    <Screen edges={["top"]}>
      <Row style={{ justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 8 }}>
        <IconButton
          icon={chevronBack}
          label={t("back")}
          onPress={() => {
            persist();
            router.back();
          }}
        />
        <View style={{ alignItems: "center" }}>
          <Text variant="subheading" align="center">
            {t("reviewTitle")}
          </Text>
          {batch && queue.length > 1 && position >= 0 ? (
            <Text variant="caption" tone="muted" align="center">
              {t("reviewOf", { i: position + 1, n: queue.length })}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon="trash-can-outline"
          tone="danger"
          label={t("delete")}
          onPress={() =>
            confirmAction(t("deleteInvoiceConfirm"), t("delete"), t("cancel"), () => {
              store.deleteInvoices([draft.id]);
              router.back();
            })
          }
        />
      </Row>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {draft.localUri ? (
            <Pressable onPress={() => draft.source !== "pdf" && setPreviewOpen(true)} style={[styles.preview, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              {draft.source === "pdf" ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Icon name="file-pdf-box" size={40} color={colors.danger} />
                  <Text variant="label" tone="muted">
                    PDF
                  </Text>
                </View>
              ) : (
                <>
                  <Image source={{ uri: draft.localUri }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
                  <View style={[styles.previewBadge, { flexDirection: row }]}>
                    <Icon name="magnify-plus-outline" size={14} color="#FFFFFF" />
                    <Text variant="caption" style={{ color: "#FFFFFF" }}>
                      {t("viewOriginal")}
                    </Text>
                  </View>
                </>
              )}
            </Pressable>
          ) : null}

          {draft.source !== "manual" ? (
            <Card tone={highConfidence ? "success" : "warning"} style={{ marginBottom: 12 }}>
              <Row gap={10}>
                <Icon name={highConfidence ? "shield-check-outline" : "alert-circle-outline"} size={22} color={highConfidence ? colors.success : colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{highConfidence ? t("confidenceHigh") : t("confidenceLow")}</Text>
                  <Text variant="caption" tone="muted">
                    {t("confidenceLabel", { n: Math.round(draft.confidence * 100) })}
                  </Text>
                </View>
              </Row>
            </Card>
          ) : null}

          {draft.qrStatus !== "none" ? (
            <Card tone={draft.qrStatus === "valid" ? "alt" : "danger"} style={{ marginBottom: 12 }}>
              <Row gap={10} align="flex-start">
                <Icon name="qrcode-scan" size={20} color={draft.qrStatus === "valid" ? colors.success : colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{draft.qrStatus === "valid" ? t("qrValid") : t("qrMismatch")}</Text>
                  <Text variant="caption" tone="faint">
                    {t("qrNote")}
                  </Text>
                </View>
              </Row>
            </Card>
          ) : null}

          {warnings.length ? (
            <Card tone="alt" style={{ marginBottom: 12 }}>
              <Text variant="label" tone="muted" style={{ marginBottom: 6 }}>
                {t("aiWarnings")}
              </Text>
              {warnings.map((warning, index) => (
                <Row key={index} gap={8} align="flex-start">
                  <Text tone="muted">•</Text>
                  <Text variant="caption" style={{ flex: 1 }}>
                    {warning}
                  </Text>
                </Row>
              ))}
            </Card>
          ) : null}

          <SectionLabel title={t("sectionParties")} icon="domain" />
          <Field label={t("fieldVendor")} value={draft.vendorName} onChangeText={(value) => set({ vendorName: value })} warning={!draft.vendorName} />
          <Field
            label={t("fieldVendorTaxId")}
            value={draft.vendorTaxId}
            onChangeText={(value) => set({ vendorTaxId: normalizeDigits(value).replace(/\D/g, "").slice(0, 15) })}
            numeric
            keyboardType="number-pad"
            error={taxIdInvalid ? t("taxIdInvalid") : null}
            placeholder="3XXXXXXXXXXXXX3"
          />
          <Field label={t("fieldCustomer")} value={draft.customerName} onChangeText={(value) => set({ customerName: value })} />

          <SectionLabel title={t("sectionInvoice")} icon="file-document-outline" />
          <Row gap={10} align="flex-start">
            <Field flex={1} label={t("fieldInvoiceNumber")} value={draft.invoiceNumber} onChangeText={(value) => set({ invoiceNumber: value })} ltr />
            <Field
              flex={1}
              label={t("fieldDate")}
              value={draft.issueDate}
              placeholder={t("datePlaceholder")}
              onChangeText={(value) => set({ issueDate: normalizeDigits(value) })}
              onBlur={() => set({ issueDate: normalizeDate(draft.issueDate) })}
              ltr
              warning={!draft.issueDate}
            />
          </Row>

          <SectionLabel title={t("sectionAmounts")} icon="cash-multiple" />
          <Row gap={10} align="flex-start">
            <Field flex={1} label={t("fieldSubtotal")} value={amountText.subtotal} onChangeText={(value) => setAmount("subtotal", value)} numeric placeholder="0.00" />
            <Field flex={1} label={t("fieldVat")} value={amountText.vat} onChangeText={(value) => setAmount("vat", value)} numeric placeholder="0.00" warning={amountCheck === "vat-unusual"} />
          </Row>
          <Field label={`${t("fieldTotal")} (${draft.currency})`} value={amountText.total} onChangeText={(value) => setAmount("total", value)} numeric placeholder="0.00" warning={amountCheck === "sum-mismatch" || !draft.total} />
          {amountCheck === "sum-mismatch" || amountCheck === "vat-unusual" ? (
            <Card tone="warning" style={{ marginTop: -4, marginBottom: 14 }}>
              <Text variant="caption" style={{ marginBottom: 8 }}>
                {amountCheck === "sum-mismatch" ? t("amountsMismatch") : t("vatUnusual")}
              </Text>
              <Row gap={8}>
                <Button title={`${t("fixTotal")} → ${formatMoney(round2(draft.subtotal + draft.vat), false)}`} size="sm" variant="secondary" full={false} onPress={() => applyAmounts({ total: round2(draft.subtotal + draft.vat) })} />
                {draft.subtotal ? (
                  <Button title={t("fixVat")} size="sm" variant="secondary" full={false} onPress={() => applyAmounts({ vat: round2(draft.subtotal * VAT_RATE), total: round2(draft.subtotal * (1 + VAT_RATE)) })} />
                ) : null}
              </Row>
            </Card>
          ) : null}

          <SectionLabel title={t("sectionClassification")} icon="tag-outline" />
          <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
            {t("fieldCategory")}
          </Text>
          <View style={{ flexDirection: row, flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {CATEGORY_KEYS.map((key) => (
              <Chip key={key} label={CATEGORY_LABELS[key][language]} icon={CATEGORY_LABELS[key].icon} active={draft.category === key} onPress={() => set({ category: key })} />
            ))}
          </View>
          <Field label={t("fieldProject")} value={draft.projectName} onChangeText={(value) => set({ projectName: value })} />
          {recentProjects.length ? (
            <View style={{ flexDirection: row, flexWrap: "wrap", gap: 6, marginTop: -6, marginBottom: 14 }}>
              {recentProjects.map((project) => (
                <Chip key={project} label={project} active={draft.projectName === project} onPress={() => set({ projectName: project })} />
              ))}
            </View>
          ) : null}
          <Field label={t("fieldNotes")} value={draft.notes} onChangeText={(value) => set({ notes: value })} multiline />

          <Text variant="caption" tone="faint" align="center" style={{ marginTop: 8 }}>
            {t("disclaimer")}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 12), flexDirection: row }]}>
        {draft.status === "approved" ? (
          <>
            <Button
              title={t("markNeedsReview")}
              variant="secondary"
              size="md"
              style={{ flex: 1 }}
              onPress={() => {
                persist("needs-review");
                set({ status: "needs-review" });
              }}
            />
            <Button
              title={t("done")}
              size="md"
              style={{ flex: 1 }}
              onPress={() => {
                persist();
                router.back();
              }}
            />
          </>
        ) : (
          <>
            {batch && queue.length > 1 ? (
              <Button
                title={t("next")}
                variant="secondary"
                size="md"
                full={false}
                onPress={() => {
                  persist();
                  goNext();
                }}
              />
            ) : null}
            <Button title={batch && queue.length > 1 ? t("approveAndNext") : t("approve")} icon="check" size="md" style={{ flex: 1 }} onPress={approve} />
          </>
        )}
      </View>

      <Modal visible={previewOpen} animationType="fade" onRequestClose={() => setPreviewOpen(false)} transparent={false}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flexGrow: 1 }} centerContent>
            {draft.localUri ? <Image source={{ uri: draft.localUri }} style={{ flex: 1, minHeight: 500 }} contentFit="contain" /> : null}
          </ScrollView>
          <View style={{ position: "absolute", top: insets.top + 10, right: 16 }}>
            <IconButton icon="close" tone="inverse" label={t("close")} onPress={() => setPreviewOpen(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/** Editable fields only; status changes go through explicit approve/unapprove actions. */
function draftPatch(draft: Invoice): Partial<Invoice> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, status: _status, ...rest } = draft;
  return rest;
}

function SectionLabel({ title, icon }: { title: string; icon: string }) {
  const { colors } = useTheme();
  return (
    <Row gap={8} style={{ marginTop: 10, marginBottom: 12 }}>
      <Icon name={icon} size={17} color={colors.accent} />
      <Text variant="subheading">{title}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  preview: { height: 190, borderRadius: radius.lg, overflow: "hidden", marginBottom: 12, borderWidth: StyleSheet.hairlineWidth },
  previewBadge: { position: "absolute", bottom: 10, left: 10, alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
