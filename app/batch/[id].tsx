import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { InvoiceRow } from "@/components/invoice-row";
import { Button, IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, Loading, ProgressBar, Row, ScrollScreen, SectionTitle } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { confirmAction } from "@/lib/dialogs";
import { useI18n } from "@/lib/i18n";
import { useStore, type ScanJob } from "@/lib/store";
import { radius, useTheme } from "@/lib/theme";
import { isSafeToBulkApprove } from "@/shared/invoice";

export default function BatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { t, formatMoney, chevronBack } = useI18n();
  const store = useStore();
  const batch = store.batches.find((item) => item.id === id);
  const invoices = useMemo(() => store.invoices.filter((invoice) => invoice.batchId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [id, store.invoices]);
  const jobs = store.jobs.filter((job) => job.batchId === id);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(batch?.name ?? "");

  if (!batch && !store.ready) return <Loading />;
  if (!batch) {
    return (
      <ScrollScreen>
        <EmptyState icon="folder-remove-outline" title={t("batchEmpty")} action={<Button title={t("back")} variant="secondary" onPress={() => router.back()} />} />
      </ScrollScreen>
    );
  }

  const pending = jobs.filter((job) => job.status !== "failed").length;
  const totalItems = invoices.length + jobs.length;
  const review = invoices.filter((invoice) => invoice.status === "needs-review");
  const approved = invoices.length - review.length;
  const safe = review.filter(isSafeToBulkApprove);
  const sum = (key: "subtotal" | "vat" | "total") => invoices.reduce((total, invoice) => total + invoice[key], 0);

  return (
    <ScrollScreen>
      <Row style={{ justifyContent: "space-between", paddingTop: 8, paddingBottom: 12 }}>
        <IconButton icon={chevronBack} label={t("back")} onPress={() => router.back()} />
        <Row gap={8}>
          <IconButton icon="plus" label={t("addMore")} onPress={() => router.push({ pathname: "/scan", params: { batchId: batch.id } })} />
          <IconButton
            icon="trash-can-outline"
            tone="danger"
            label={t("deleteBatch")}
            onPress={() =>
              confirmAction(t("deleteBatchConfirm"), t("delete"), t("cancel"), () => {
                store.deleteBatch(batch.id);
                router.back();
              })
            }
          />
        </Row>
      </Row>

      {editingName ? (
        <Field
          label={t("batchName")}
          value={name}
          autoFocus
          onChangeText={setName}
          onBlur={() => {
            if (name.trim()) store.renameBatch(batch.id, name.trim());
            setEditingName(false);
          }}
          returnKeyType="done"
        />
      ) : (
        <View style={{ marginBottom: 16 }}>
          <Text variant="overline" tone="accent">
            {t("batchTitle")}
          </Text>
          <Row gap={8}>
            <Text variant="title" style={{ flexShrink: 1 }} numberOfLines={2} onPress={() => setEditingName(true)}>
              {batch.name}
            </Text>
            <Icon name="pencil-outline" size={18} color={colors.textFaint} />
          </Row>
        </View>
      )}

      {pending > 0 ? (
        <Card tone="accent" style={{ marginBottom: 12 }}>
          <Row gap={10} style={{ marginBottom: 10 }}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t("processingProgress", { done: totalItems - pending, total: totalItems })}
            </Text>
          </Row>
          <ProgressBar value={totalItems ? (totalItems - pending) / totalItems : 0} />
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Text variant="label" tone="muted">
            {t("batchTotals")}
          </Text>
          <Text variant="caption" tone="muted">
            {t("invoicesCount", { n: invoices.length })} · {t("approvedCount", { n: approved })}
          </Text>
        </Row>
        <Text variant="numberLarge" style={{ marginTop: 4 }}>
          {formatMoney(sum("total"))}
        </Text>
        <Row gap={16} style={{ marginTop: 8 }}>
          <Text variant="caption" tone="muted">
            {t("fieldSubtotal")}: {formatMoney(sum("subtotal"), false)}
          </Text>
          <Text variant="caption" tone="muted">
            {t("fieldVat")}: {formatMoney(sum("vat"), false)}
          </Text>
        </Row>
        {invoices.length ? (
          <View style={{ marginTop: 12 }}>
            <ProgressBar value={approved / invoices.length} tone="success" />
          </View>
        ) : null}
      </Card>

      <View style={{ gap: 10, marginTop: 14 }}>
        {review.length ? (
          <Button title={`${t("startReview")} (${review.length})`} icon="clipboard-check-outline" onPress={() => router.push({ pathname: "/invoice/[id]", params: { id: review[0].id, batch: batch.id } })} />
        ) : invoices.length && !pending ? (
          <Card tone="success" padded>
            <Row gap={8}>
              <Icon name="check-decagram" size={20} color={colors.success} />
              <Text variant="bodyStrong" tone="success">
                {t("allReviewed")}
              </Text>
            </Row>
          </Card>
        ) : null}
        {safe.length > 1 ? (
          <View>
            <Button title={t("approveSafe", { n: safe.length })} icon="check-all" variant="secondary" onPress={() => store.approveInvoices(safe.map((invoice) => invoice.id))} />
            <Text variant="caption" tone="faint" align="center" style={{ marginTop: 4 }}>
              {t("approveSafeHint")}
            </Text>
          </View>
        ) : null}
        {invoices.length ? (
          <Button title={t("exportBatch")} icon="microsoft-excel" variant={review.length ? "secondary" : "accent"} onPress={() => router.push({ pathname: "/export", params: { batchId: batch.id } })} />
        ) : null}
      </View>

      {jobs.length ? (
        <>
          <SectionTitle title={t("processing")} />
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </>
      ) : null}

      {invoices.length ? (
        <>
          <SectionTitle title={t("invoicesTitle")} />
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} onPress={() => router.push({ pathname: "/invoice/[id]", params: { id: invoice.id, batch: batch.id } })} />
          ))}
        </>
      ) : !jobs.length ? (
        <EmptyState icon="file-document-outline" title={t("batchEmpty")} action={<Button title={t("addMore")} icon="plus" variant="secondary" onPress={() => router.push({ pathname: "/scan", params: { batchId: batch.id } })} />} />
      ) : null}
    </ScrollScreen>
  );
}

function JobRow({ job }: { job: ScanJob }) {
  const { colors } = useTheme();
  const { t, row } = useI18n();
  const { retryJob, removeJob, jobToManual } = useStore();
  const failed = job.status === "failed";
  return (
    <View style={[styles.job, { flexDirection: row, backgroundColor: colors.surface, borderColor: failed ? colors.danger : colors.border }]}>
      {job.mimeType === "application/pdf" ? (
        <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
          <Icon name="file-pdf-box" size={22} color={colors.danger} />
        </View>
      ) : (
        <Image source={{ uri: job.uri }} style={styles.thumb} contentFit="cover" />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong" tone={failed ? "danger" : "default"}>
          {failed ? t("failed") : job.status === "processing" ? t("processing") : t("queued")}
        </Text>
        {job.errorKey ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {t(job.errorKey)}
          </Text>
        ) : null}
        {failed ? (
          <Row gap={6} style={{ marginTop: 4, flexWrap: "wrap" }}>
            <Button title={t("retry")} size="sm" variant="secondary" full={false} onPress={() => retryJob(job.id)} />
            <Button
              title={t("addManually")}
              size="sm"
              variant="secondary"
              full={false}
              onPress={() => {
                const invoice = jobToManual(job.id);
                if (invoice) router.push({ pathname: "/invoice/[id]", params: { id: invoice.id, batch: job.batchId } });
              }}
            />
            <Button title={t("delete")} size="sm" variant="danger" full={false} onPress={() => removeJob(job.id)} />
          </Row>
        ) : null}
      </View>
      {!failed ? <ActivityIndicator color={colors.accent} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  job: { alignItems: "center", gap: 12, padding: 10, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  thumb: { width: 46, height: 58, borderRadius: 9 },
});
