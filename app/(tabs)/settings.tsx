import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Switch, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, Divider, ListRow, PageHeader, ProgressBar, Row, ScrollScreen, Segmented, SectionTitle } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { errorKey } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AI_EXTRACTION } from "@/lib/features";
import { confirmAction, notify } from "@/lib/dialogs";
import { useI18n } from "@/lib/i18n";
import { usePreferences, type Language, type ThemeMode } from "@/lib/preferences";
import { useStore } from "@/lib/store";
import { isBackendConfigured, supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

const PRIVACY_URL = "https://github.com/Heeero3k/invoiceflow-ksa/blob/main/PRIVACY_POLICY.md";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { t, formatDate, formatTime } = useI18n();
  const prefs = usePreferences();
  const auth = useAuth();
  const store = useStore();
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    if (!AI_EXTRACTION || !auth.isSignedIn || !auth.user) return;
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }).slice(0, 7);
    Promise.all([
      supabase.from("usage_counters").select("scans").eq("month", month).maybeSingle(),
      supabase.from("profiles").select("plan").maybeSingle(),
    ])
      .then(([counter, profile]) => setUsage({ used: counter.data?.scans ?? 0, limit: profile.data?.plan === "pro" ? 2000 : 40 }))
      .catch(() => undefined);
  }, [auth.isSignedIn, auth.user]);

  return (
    <ScrollScreen>
      <PageHeader title={t("settingsTitle")} />

      <SectionTitle title={t("account")} />
      <Card>
        <Row gap={12}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" }}>
            {auth.displayName ? <Text variant="heading" tone="accent">{auth.displayName.charAt(0).toUpperCase()}</Text> : <Icon name="account-outline" size={24} color={colors.accent} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="subheading">{auth.isSignedIn ? (auth.displayName ?? auth.email) : t("guestMode")}</Text>
            <Text variant="caption" tone="muted">
              {auth.isSignedIn ? auth.email : t("guestModeBody")}
            </Text>
          </View>
        </Row>
        {auth.isSignedIn ? (
          <>
            {usage ? (
              <View style={{ marginTop: 16, gap: 6 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text variant="label" tone="muted">
                    {t("usage")}
                  </Text>
                  <Text variant="label">{t("usageScans", { used: usage.used, limit: usage.limit })}</Text>
                </Row>
                <ProgressBar value={usage.used / usage.limit} />
              </View>
            ) : null}
            <Row gap={8} style={{ marginTop: 16 }}>
              <Button title={t("syncNow")} icon="sync" variant="secondary" size="md" style={{ flex: 1 }} loading={store.syncing} onPress={() => void store.syncNow()} />
              <Button title={t("signOut")} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => confirmAction(t("signOutConfirm"), t("signOut"), t("cancel"), () => void auth.signOut())} />
            </Row>
            <Text variant="caption" tone="faint" align="center" style={{ marginTop: 8 }}>
              {store.lastSyncedAt ? t("lastSynced", { time: `${formatDate(store.lastSyncedAt)} ${formatTime(store.lastSyncedAt)}` }) : t("notSynced")}
            </Text>
          </>
        ) : isBackendConfigured ? (
          <Button title={t("signIn")} icon="login" style={{ marginTop: 16 }} onPress={() => router.push("/sign-in")} />
        ) : (
          <Text variant="caption" tone="warning" style={{ marginTop: 12 }}>
            {t("backendMissing")}
          </Text>
        )}
      </Card>

      <SectionTitle title={t("preferences")} />
      <Card>
        <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
          {t("language")}
        </Text>
        <Segmented<Language>
          value={prefs.language}
          onChange={(language) => prefs.update({ language, exportLanguage: language })}
          options={[
            { value: "ar", label: "العربية" },
            { value: "en", label: "English" },
          ]}
        />
        <Text variant="label" tone="muted" style={{ marginTop: 16, marginBottom: 8 }}>
          {t("appearance")}
        </Text>
        <Segmented<ThemeMode>
          value={prefs.themeMode}
          onChange={(themeMode) => prefs.update({ themeMode })}
          options={[
            { value: "system", label: t("themeSystem") },
            { value: "light", label: t("themeLight") },
            { value: "dark", label: t("themeDark") },
          ]}
        />
        {auth.isSignedIn ? (
          <Row gap={12} style={{ marginTop: 18 }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{t("keepOriginals")}</Text>
              <Text variant="caption" tone="muted">
                {t("keepOriginalsHint")}
              </Text>
            </View>
            <Switch value={prefs.keepOriginals} onValueChange={(keepOriginals) => prefs.update({ keepOriginals })} trackColor={{ true: colors.accent, false: colors.borderStrong }} thumbColor="#FFFFFF" />
          </Row>
        ) : null}
      </Card>

      <SectionTitle title={t("dataPrivacy")} />
      <Card padded={false}>
        <ListRow icon="shield-lock-outline" title={t("privacyPolicy")} onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <Divider />
        <ListRow
          icon="cellphone-remove"
          iconTone="neutral"
          title={t("clearLocal")}
          onPress={() => confirmAction(t("clearLocalConfirm"), t("delete"), t("cancel"), () => void store.clearLocal())}
        />
        {auth.isSignedIn ? (
          <>
            <Divider />
            <ListRow
              icon="account-remove-outline"
              danger
              title={t("deleteAccount")}
              onPress={() =>
                confirmAction(t("deleteAccountConfirm"), t("deleteAccount"), t("cancel"), async () => {
                  try {
                    await auth.deleteAccount();
                    await store.clearLocal();
                    notify(t("accountDeleted"));
                  } catch (error) {
                    notify(t("somethingWrong"), t(errorKey(error)));
                  }
                })
              }
            />
          </>
        ) : null}
      </Card>

      <Text variant="caption" tone="faint" align="center" style={{ marginTop: 24 }}>
        InvoiceFlow KSA · {t("version", { v: Constants.expoConfig?.version ?? "" })}
      </Text>
    </ScrollScreen>
  );
}
