import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Share, View } from "react-native";
import { InlineBanner } from "@/components/ads/banner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Badge, Card, Divider, EmptyState, ListRow, PageHeader, Row, ScrollScreen, SectionTitle } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { errorKey, sheets, type SheetsStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { confirmAction, notify } from "@/lib/dialogs";
import { signedExportUrl } from "@/lib/exporter";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { isBackendConfigured, supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

type ExportRow = { id: string; name: string; file_path: string | null; drive_url: string | null; sheets_url: string | null; invoice_count: number; total: number; created_at: string };

export default function ExportsScreen() {
  const { colors } = useTheme();
  const { t, formatMoney, formatDate } = useI18n();
  const { isSignedIn } = useAuth();
  const { invoices } = useStore();
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [history, setHistory] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const approvedCount = invoices.filter((invoice) => invoice.status === "approved").length;

  const refresh = useCallback(async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const [sheetStatus, files] = await Promise.all([
        sheets.status().catch(() => null),
        supabase.from("exports").select("id,name,file_path,drive_url,sheets_url,invoice_count,total,created_at").order("created_at", { ascending: false }).limit(50),
      ]);
      setStatus(sheetStatus);
      setHistory((files.data as ExportRow[] | null) ?? []);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const connect = async () => {
    setConnecting(true);
    try {
      const returnTo = Platform.OS === "web" ? `${window.location.origin}/exports` : Linking.createURL("exports");
      const { url } = await sheets.connect(returnTo);
      if (Platform.OS === "web") {
        window.location.href = url;
        return;
      }
      await WebBrowser.openAuthSessionAsync(url, returnTo);
      await refresh();
    } catch (error) {
      notify(t("somethingWrong"), t(errorKey(error)));
    } finally {
      setConnecting(false);
    }
  };

  const openFile = async (file: ExportRow, mode: "open" | "share") => {
    try {
      const url = file.drive_url ?? file.sheets_url ?? (file.file_path ? await signedExportUrl(file.file_path, file.name) : null);
      if (!url) return;
      if (mode === "open") await Linking.openURL(url);
      else await Share.share({ message: `${file.name}\n${url}`, url });
    } catch (error) {
      notify(t("somethingWrong"), t(errorKey(error)));
    }
  };

  return (
    <ScrollScreen>
      <PageHeader title={t("exportsTitle")} />

      <Button title={`${t("quickExportAll")} (${approvedCount})`} icon="microsoft-excel" disabled={!approvedCount} onPress={() => router.push("/export")} />

      {!isBackendConfigured ? (
        <Card tone="warning" style={{ marginTop: 16 }}>
          <Text variant="body">{t("backendMissing")}</Text>
        </Card>
      ) : !isSignedIn ? (
        <Card style={{ marginTop: 16 }}>
          <EmptyState icon="cloud-lock-outline" title={t("signInBannerTitle")} body={t("signInBannerBody")} action={<Button title={t("signIn")} onPress={() => router.push("/sign-in")} />} />
        </Card>
      ) : (
        <>
          <SectionTitle title={t("googleCardTitle")} />
          <Card>
            <Row gap={12}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
                <Icon name="google" size={24} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">Google Drive · Sheets</Text>
                {status?.connected ? (
                  <Badge tone="success" icon="check" label={status.googleEmail ? t("sheetsConnectedAs", { email: status.googleEmail }) : t("sheetsConnected")} />
                ) : (
                  <Text variant="caption" tone="muted">
                    {status && !status.configured ? t("sheetsNotConfigured") : t("googleCardBody")}
                  </Text>
                )}
              </View>
              {loading ? <ActivityIndicator color={colors.accent} /> : null}
            </Row>
            {status?.connected && (status.driveFolderUrl || status.spreadsheetUrl) ? (
              <Row gap={8} style={{ marginTop: 14 }}>
                {status.driveFolderUrl ? <Button title={t("openDrive")} icon="google-drive" size="md" style={{ flex: 1 }} onPress={() => void Linking.openURL(status.driveFolderUrl!)} /> : null}
                {status.spreadsheetUrl ? <Button title={t("openSheet")} icon="google-spreadsheet" variant="secondary" size="md" style={{ flex: 1 }} onPress={() => void Linking.openURL(status.spreadsheetUrl!)} /> : null}
              </Row>
            ) : null}
            <Row gap={8} style={{ marginTop: status?.connected ? 8 : 14 }}>
              {status?.connected ? (
                <>
                  <Button
                    title={t("disconnect")}
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      confirmAction(t("disconnect"), t("disconnect"), t("cancel"), async () => {
                        await sheets.disconnect().catch(() => undefined);
                        void refresh();
                      })
                    }
                  />
                </>
              ) : (
                <Button title={t("connect")} icon="link-variant" size="md" loading={connecting} disabled={status ? !status.configured : false} onPress={() => void connect()} />
              )}
            </Row>
          </Card>

          <Card tone="accent" style={{ marginTop: 12 }}>
            <Row gap={10} align="flex-start">
              <Icon name="monitor-arrow-down" size={22} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{t("pcAccessTitle")}</Text>
                <Text variant="caption" tone="muted">
                  {t("pcAccessBody")}
                </Text>
              </View>
            </Row>
          </Card>

          <SectionTitle title={t("exportHistory")} />
          {history.length ? (
            <Card padded={false}>
              {history.map((file, index) => (
                <View key={file.id}>
                  {index ? <Divider /> : null}
                  <ListRow
                    icon={file.drive_url ? "google-drive" : file.name.endsWith(".csv") ? "file-delimited-outline" : "microsoft-excel"}
                    title={file.name}
                    subtitle={`${formatDate(file.created_at)} · ${t("invoicesCount", { n: file.invoice_count })} · ${formatMoney(Number(file.total))}`}
                    onPress={() => void openFile(file, "open")}
                    right={
                      <Button title={t("share")} size="sm" variant="secondary" full={false} onPress={() => void openFile(file, "share")} />
                    }
                  />
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <EmptyState icon="folder-open-outline" title={t("noExportsTitle")} body={t("noExportsBody")} />
            </Card>
          )}
        </>
      )}

      <InlineBanner />
    </ScrollScreen>
  );
}
