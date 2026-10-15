import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import { Button, IconButton, haptic } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Card, Row, ScrollScreen, Segmented } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { maybeShowInterstitial } from "@/lib/ads";
import { errorKey, sheets, type SheetsStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/dialogs";
import { runExport, type ExportFormat, type ExportResult } from "@/lib/exporter";
import { useI18n } from "@/lib/i18n";
import { usePreferences, type Language } from "@/lib/preferences";
import { takeExportSelection } from "@/lib/selection";
import { useStore } from "@/lib/store";
import { isBackendConfigured } from "@/lib/supabase";
import { radius, useTheme } from "@/lib/theme";

export default function ExportScreen() {
  const params = useLocalSearchParams<{ batchId?: string; scope?: string }>();
  const { colors } = useTheme();
  const { t, formatMoney, row } = useI18n();
  const { exportLanguage, update } = usePreferences();
  const { isSignedIn, user } = useAuth();
  const store = useStore();
  const [selection] = useState(() => (params.scope === "selection" ? takeExportSelection() : []));

  const scoped = useMemo(() => {
    if (params.batchId) return store.invoices.filter((invoice) => invoice.batchId === params.batchId);
    if (params.scope === "selection") return store.invoices.filter((invoice) => selection.includes(invoice.id));
    return store.invoices.filter((invoice) => invoice.status === "approved");
  }, [params.batchId, params.scope, selection, store.invoices]);
  const batch = params.batchId ? store.batches.find((item) => item.id === params.batchId) : undefined;
  const unapproved = scoped.filter((invoice) => invoice.status !== "approved").length;

  const [title, setTitle] = useState(batch?.name ?? (params.scope === "selection" ? t("exportSelected") : t("quickExportAll")));
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [includeUnapproved, setIncludeUnapproved] = useState(true);
  const [share, setShare] = useState(true);
  const [toDrive, setToDrive] = useState(false);
  const [driveOriginals, setDriveOriginals] = useState(true);
  const [toSheets, setToSheets] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sheetsStatus, setSheetsStatus] = useState<SheetsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(ExportResult & { count: number }) | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    sheets
      .status()
      .then((status) => {
        setSheetsStatus(status);
        setToDrive(status.connected);
        setToSheets(status.connected);
      })
      .catch(() => undefined);
  }, [isSignedIn]);

  const googleConnected = Boolean(sheetsStatus?.connected);
  const invoices = includeUnapproved ? scoped : scoped.filter((invoice) => invoice.status === "approved");
  const withOriginals = invoices.filter((invoice) => invoice.localUri).length;
  const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);

  const start = async () => {
    if (!invoices.length) return notify(t("nothingToExport"));
    setBusy(true);
    try {
      const outcome = await runExport({
        invoices,
        batches: store.batches,
        title: title.trim() || "InvoiceFlow",
        format,
        language: exportLanguage,
        share,
        drive: toDrive && googleConnected,
        driveOriginals,
        googleSheets: toSheets && googleConnected,
        userId: user?.id ?? null,
        onProgress: (done, totalFiles) => setProgress({ done, total: totalFiles }),
      });
      store.markExported(
        invoices.map((invoice) => invoice.id),
        params.batchId ? [params.batchId] : [],
      );
      haptic("success");
      setResult({ ...outcome, count: invoices.length });
      maybeShowInterstitial();
    } catch (error) {
      notify(t("somethingWrong"), t(errorKey(error)));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (result) {
    return (
      <ScrollScreen edges={["top", "bottom"]} contentStyle={{ paddingTop: 40 }}>
        <View style={{ alignItems: "center", gap: 10 }}>
          <View style={[styles.doneIcon, { backgroundColor: colors.successSoft }]}>
            <Icon name="check-bold" size={34} color={colors.success} />
          </View>
          <Text variant="title" align="center">
            {t("exportDone")}
          </Text>
          <Text variant="body" tone="muted" align="center">
            {result.fileName}
          </Text>
        </View>
        <View style={{ gap: 10, marginTop: 28 }}>
          {result.driveUrl ? (
            <Card>
              <Row gap={10} align="flex-start">
                <Icon name="google-drive" size={22} color={colors.accent} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{t("destDrive")}</Text>
                  <Text variant="caption" tone="muted">
                    {result.originalsUploaded ? t("exportDoneDriveOriginals", { n: result.originalsUploaded }) : t("exportDoneDrive")}
                  </Text>
                </View>
              </Row>
              <Button title={t("openDriveFolder")} icon="open-in-new" variant="secondary" size="md" style={{ marginTop: 12 }} onPress={() => void Linking.openURL(result.driveUrl!)} />
            </Card>
          ) : null}
          {result.sheetsUrl ? (
            <Card>
              <Row gap={10}>
                <Icon name="google-spreadsheet" size={22} color={colors.success} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {t("exportDoneSheets", { n: result.count })}
                </Text>
              </Row>
              <Button title={t("openSheet")} icon="open-in-new" variant="secondary" size="md" style={{ marginTop: 12 }} onPress={() => void Linking.openURL(result.sheetsUrl!)} />
            </Card>
          ) : null}
          <Button title={t("done")} onPress={() => router.back()} style={{ marginTop: 8 }} />
        </View>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen edges={["top", "bottom"]}>
      <Row style={{ justifyContent: "space-between", paddingTop: 12, paddingBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{t("exportTitle")}</Text>
          <Text variant="caption" tone="muted">
            {t("exportSubtitle", { n: invoices.length, total: formatMoney(total) })}
          </Text>
        </View>
        <IconButton icon="close" label={t("close")} onPress={() => router.back()} />
      </Row>

      <View style={{ marginTop: 16 }}>
        <Field label={t("exportFileName")} value={title} onChangeText={setTitle} icon="file-outline" />
      </View>

      <Text variant="label" tone="muted" style={styles.label}>
        {t("exportFormat")}
      </Text>
      <OptionCard selected={format === "xlsx"} icon="microsoft-excel" title={t("formatExcel")} hint={t("formatExcelHint")} onPress={() => setFormat("xlsx")} />
      <OptionCard selected={format === "csv"} icon="file-delimited-outline" title={t("formatCsv")} hint={t("formatCsvHint")} onPress={() => setFormat("csv")} />

      {format === "xlsx" ? (
        <>
          <Text variant="label" tone="muted" style={styles.label}>
            {t("exportLanguage")}
          </Text>
          <Segmented<Language>
            value={exportLanguage}
            onChange={(value) => update({ exportLanguage: value })}
            options={[
              { value: "ar", label: "العربية" },
              { value: "en", label: "English" },
            ]}
          />
        </>
      ) : null}

      <Text variant="label" tone="muted" style={styles.label}>
        {t("exportDestinations")}
      </Text>
      <Card padded={false}>
        <ToggleRow icon="share-variant-outline" title={t("destShare")} hint={t("destShareHint")} value={share} onChange={setShare} />
        <ToggleRow
          icon="google-drive"
          title={t("destDrive")}
          hint={!isSignedIn ? t("requiresSignIn") : googleConnected ? t("destDriveHint") : t("googleNotConnected")}
          value={toDrive && googleConnected}
          onChange={setToDrive}
          disabled={!googleConnected}
          onDisabledPress={isSignedIn ? () => router.push("/exports") : isBackendConfigured ? () => router.push("/sign-in") : undefined}
        />
        {toDrive && googleConnected && withOriginals > 0 ? (
          <ToggleRow icon="image-multiple-outline" title={t("driveOriginals", { n: withOriginals })} hint={t("driveOriginalsHint")} value={driveOriginals} onChange={setDriveOriginals} />
        ) : null}
        <ToggleRow
          icon="google-spreadsheet"
          title={t("destSheets")}
          hint={!isSignedIn ? t("requiresSignIn") : googleConnected ? t("destSheetsHint") : t("googleNotConnected")}
          value={toSheets && googleConnected}
          onChange={setToSheets}
          disabled={!googleConnected}
          onDisabledPress={isSignedIn ? () => router.push("/exports") : isBackendConfigured ? () => router.push("/sign-in") : undefined}
          last
        />
      </Card>

      {unapproved > 0 ? (
        <Pressable onPress={() => setIncludeUnapproved((value) => !value)} style={[styles.include, { flexDirection: row }]}>
          <Icon name={includeUnapproved ? "checkbox-marked" : "checkbox-blank-outline"} size={22} color={includeUnapproved ? colors.accent : colors.textFaint} />
          <Text variant="body" style={{ flex: 1 }}>
            {t("includeUnapproved", { n: unapproved })}
          </Text>
        </Pressable>
      ) : null}

      <Button
        title={busy ? (progress && progress.total > 1 ? t("uploadingProgress", { done: progress.done, total: progress.total }) : t("exporting")) : t("exportNow")}
        icon="export-variant"
        loading={busy && !progress}
        disabled={busy || !invoices.length || (!share && !(toDrive && googleConnected) && !(toSheets && googleConnected))}
        onPress={() => void start()}
        style={{ marginTop: 22 }}
      />
    </ScrollScreen>
  );
}

function OptionCard({ selected, icon, title, hint, onPress }: { selected: boolean; icon: string; title: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  const { row } = useI18n();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.option, { flexDirection: row, borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.surface }]}>
      <Icon name={icon} size={24} color={selected ? colors.accent : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <Icon name={selected ? "radiobox-marked" : "radiobox-blank"} size={22} color={selected ? colors.accent : colors.textFaint} />
    </Pressable>
  );
}

function ToggleRow({ icon, title, hint, value, onChange, disabled, onDisabledPress, last }: { icon: string; title: string; hint: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean; onDisabledPress?: () => void; last?: boolean }) {
  const { colors } = useTheme();
  const { row } = useI18n();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      onPress={() => (disabled ? onDisabledPress?.() : onChange(!value))}
      style={[styles.toggle, { flexDirection: row, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border }]}
    >
      <Icon name={icon} size={22} color={disabled ? colors.textFaint : colors.accent} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={disabled ? "faint" : "default"}>
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.accent, false: colors.borderStrong }} thumbColor="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 20, marginBottom: 8 },
  option: { alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, marginBottom: 8 },
  toggle: { alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  include: { alignItems: "center", gap: 10, marginTop: 16 },
  doneIcon: { width: 80, height: 80, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});
