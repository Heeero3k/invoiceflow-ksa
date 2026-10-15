import { AppError, requireEnv } from "./http.ts";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

export function googleConfig() {
  return {
    clientId: requireEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: requireEnv("SHEETS_REDIRECT_URI"),
  };
}

export function isGoogleConfigured() {
  return Boolean(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("SHEETS_REDIRECT_URI"));
}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return { ok: response.ok, body: await response.json() };
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const { ok, body } = await tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!ok) throw new Error(body.error_description ?? body.error ?? "Google token exchange failed");
  return body as { access_token: string; refresh_token?: string; id_token?: string };
}

export async function accessTokenFromRefresh(refreshToken: string) {
  const { clientId, clientSecret } = googleConfig();
  const { ok, body } = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  if (!ok) {
    if (body.error === "invalid_grant") throw new AppError("sheets_reconnect", "Google access was revoked; reconnect", 409);
    throw new Error(body.error_description ?? body.error ?? "Google token refresh failed");
  }
  return body.access_token as string;
}

/** The id_token comes straight from Google's token endpoint over TLS, so reading it is safe. */
export function emailFromIdToken(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

export class GoogleApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function driveApi<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new GoogleApiError(body?.error?.message ?? `Google Drive error ${response.status}`, response.status);
  return body as T;
}

export async function sheetsApi<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new GoogleApiError(body?.error?.message ?? `Google Sheets error ${response.status}`, response.status);
  return body as T;
}
