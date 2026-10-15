// Google redirects here after consent. Authenticated by the signed `state`.
import { encryptText, verifyState } from "../_shared/crypto.ts";
import { emailFromIdToken, exchangeCode } from "../_shared/google.ts";
import { adminClient } from "../_shared/supabase.ts";

function redirect(target: string, params: Record<string, string>) {
  const url = `${target}${target.includes("?") ? "&" : "?"}${new URLSearchParams(params)}`;
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  let returnTo = "invoiceflowksa://exports";
  try {
    const payload = await verifyState<{ userId: string; returnTo: string }>(state);
    returnTo = payload.returnTo;
    if (url.searchParams.get("error")) return redirect(returnTo, { sheets: "cancelled" });

    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing authorization code");
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) throw new Error("Google did not return a refresh token");

    const { error } = await adminClient().from("google_connections").upsert({
      user_id: payload.userId,
      refresh_token_enc: await encryptText(tokens.refresh_token),
      google_email: emailFromIdToken(tokens.id_token),
      spreadsheet_id: null,
      spreadsheet_url: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return redirect(returnTo, { sheets: "connected" });
  } catch (error) {
    console.error(error);
    return redirect(returnTo, { sheets: "error" });
  }
});
