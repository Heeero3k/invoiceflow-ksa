import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, Loading, Screen } from "@/components/ui/layout";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

/** Landing route for the email sign-in link (invoiceflowksa://auth-callback?code=…). */
export default function AuthCallback() {
  const { code, error_description: errorDescription } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const { t } = useI18n();
  const [failed, setFailed] = useState<string | null>(errorDescription ?? null);

  useEffect(() => {
    if (!code) {
      if (!errorDescription) router.replace("/");
      return;
    }
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => (error ? setFailed(error.message) : router.replace("/")))
      .catch((error: Error) => setFailed(error.message));
  }, [code, errorDescription]);

  if (!failed) return <Loading />;
  return (
    <Screen>
      <EmptyState icon="account-alert-outline" title={t("signInFailed")} body={failed} action={<Button title={t("signIn")} onPress={() => router.replace("/sign-in")} />} />
    </Screen>
  );
}
