import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform, View } from "react-native";
import { Button, IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Row, ScrollScreen } from "@/components/ui/layout";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/lib/auth";
import { notify } from "@/lib/dialogs";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

const PRIVACY_URL = "https://github.com/Heeero3k/invoiceflow-ksa/blob/main/PRIVACY_POLICY.md";

export default function SignInScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<"google" | "apple" | "email" | "verify" | null>(null);

  const done = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const withProvider = async (provider: "google" | "apple") => {
    setBusy(provider);
    try {
      if (await auth.signInWithProvider(provider)) done();
    } catch (error) {
      notify(t("signInFailed"), error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return notify(t("invalidEmail"));
    setBusy("email");
    try {
      await auth.sendEmailCode(email.trim());
      setCodeSent(true);
    } catch (error) {
      notify(t("signInFailed"), error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy("verify");
    try {
      await auth.verifyEmailCode(email.trim(), code);
      done();
    } catch (error) {
      notify(t("signInFailed"), error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollScreen edges={["top", "bottom"]} contentStyle={{ paddingBottom: 40 }}>
      <Row style={{ justifyContent: "flex-end", paddingTop: 12 }}>
        <IconButton icon="close" label={t("close")} onPress={done} />
      </Row>

      <View style={{ alignItems: "center", marginTop: 12, marginBottom: 28, gap: 10 }}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Icon name="file-document-multiple-outline" size={34} color={colors.onPrimary} />
        </View>
        <Text variant="title" align="center">
          {t("signInTitle")}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t("signInSubtitle")}
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <Button title={t("continueWithGoogle")} icon="google" variant="primary" loading={busy === "google"} onPress={() => void withProvider("google")} />
        {Platform.OS === "ios" || Platform.OS === "web" ? (
          <Button title={t("continueWithApple")} icon="apple" variant="secondary" loading={busy === "apple"} onPress={() => void withProvider("apple")} />
        ) : null}
      </View>

      <Row gap={10} style={{ marginVertical: 22 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="caption" tone="faint">
          {t("orEmail")}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </Row>

      {!codeSent ? (
        <>
          <Field label={t("emailPlaceholder")} value={email} onChangeText={setEmail} placeholder={t("emailPlaceholder")} keyboardType="email-address" autoCapitalize="none" autoComplete="email" ltr icon="email-outline" />
          <Button title={t("sendCode")} variant="secondary" loading={busy === "email"} onPress={() => void sendCode()} />
        </>
      ) : (
        <>
          <Text variant="body" tone="muted" style={{ marginBottom: 12 }}>
            {t("codeSentTo", { email: email.trim() })}
          </Text>
          <Field label={t("codePlaceholder")} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 8))} keyboardType="number-pad" numeric autoComplete="one-time-code" placeholder="••••••" />
          <Button title={t("verify")} loading={busy === "verify"} disabled={code.length < 6} onPress={() => void verify()} />
          <Button title={t("changeEmail")} variant="ghost" size="md" onPress={() => setCodeSent(false)} style={{ marginTop: 6 }} />
        </>
      )}

      <Button title={t("continueAsGuest")} variant="ghost" size="md" onPress={done} style={{ marginTop: 18 }} />
      <Text variant="caption" tone="faint" align="center" style={{ marginTop: 6 }} onPress={() => void Linking.openURL(PRIVACY_URL)}>
        {t("termsNote")}
      </Text>
    </ScrollScreen>
  );
}
