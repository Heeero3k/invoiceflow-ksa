// Google Sheets connection: status, connect (OAuth URL), export (append rows), disconnect.
import { AppError, corsHeaders, errorResponse, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { decryptText, signState } from "../_shared/crypto.ts";
import { GOOGLE_SCOPES, GoogleApiError, accessTokenFromRefresh, googleConfig, isGoogleConfigured, sheetsApi } from "../_shared/google.ts";

type Cell = string | number | null;
type ExportBody = { rows?: Cell[][]; header?: string[]; title?: string; sheetTitle?: string; rtl?: boolean };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "status":
        return json(await status(user.id));
      case "connect":
        return json(await connect(user.id, String(body.returnTo ?? "")));
      case "export":
        return json(await exportRows(user.id, body as ExportBody));
      case "disconnect":
        await adminClient().from("google_connections").delete().eq("user_id", user.id);
        return json({ connected: false });
      default:
        throw new AppError("bad_request", "Unknown action");
    }
  } catch (error) {
    return errorResponse(error);
  }
});

async function status(userId: string) {
  const { data } = await adminClient()
    .from("google_connections")
    .select("google_email, spreadsheet_url")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    configured: isGoogleConfigured(),
    connected: Boolean(data),
    googleEmail: data?.google_email ?? null,
    spreadsheetUrl: data?.spreadsheet_url ?? null,
  };
}

function isAllowedReturnTo(value: string) {
  const webOrigin = Deno.env.get("APP_WEB_ORIGIN");
  return value.startsWith("invoiceflowksa://") || value.startsWith("exp://") || (webOrigin ? value.startsWith(webOrigin) : false);
}

async function connect(userId: string, returnTo: string) {
  if (!isGoogleConfigured()) throw new AppError("not_configured", "Google Sheets is not configured", 503);
  const target = isAllowedReturnTo(returnTo) ? returnTo : "invoiceflowksa://exports";
  const { clientId, redirectUri } = googleConfig();
  const state = await signState({ userId, returnTo: target, exp: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

function rangeFor(sheetTitle: string) {
  return encodeURIComponent(`'${sheetTitle}'!A1`);
}

async function exportRows(userId: string, body: ExportBody) {
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0 || rows.length > 5000) throw new AppError("bad_request", "Provide 1-5000 rows");
  const header = Array.isArray(body.header) ? body.header : [];
  const sheetTitle = (body.sheetTitle ?? "Invoices").slice(0, 90);

  const admin = adminClient();
  const { data: connection } = await admin.from("google_connections").select("*").eq("user_id", userId).maybeSingle();
  if (!connection) throw new AppError("sheets_not_connected", "Connect Google Sheets first", 409);

  const accessToken = await accessTokenFromRefresh(await decryptText(connection.refresh_token_enc));
  let spreadsheetId: string | null = connection.spreadsheet_id;

  const append = (id: string) =>
    sheetsApi<{ updates?: { updatedRange?: string } }>(
      accessToken,
      `/${id}/values/${rangeFor(sheetTitle)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: rows }) },
    );

  let result: { updates?: { updatedRange?: string } } | null = null;
  if (spreadsheetId) {
    try {
      result = await append(spreadsheetId);
    } catch (error) {
      // The user may have deleted the spreadsheet or renamed the tab; start a fresh one.
      if (!(error instanceof GoogleApiError) || (error.status !== 404 && error.status !== 400)) throw error;
      spreadsheetId = null;
    }
  }

  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(accessToken, body.title ?? "InvoiceFlow KSA", sheetTitle, header, body.rtl ?? true);
    result = await append(spreadsheetId);
  }

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  await admin
    .from("google_connections")
    .update({ spreadsheet_id: spreadsheetId, spreadsheet_url: spreadsheetUrl, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return { spreadsheetUrl, updatedRange: result?.updates?.updatedRange ?? null };
}

async function createSpreadsheet(accessToken: string, title: string, sheetTitle: string, header: string[], rtl: boolean) {
  const created = await sheetsApi<{ spreadsheetId: string; sheets: { properties: { sheetId: number } }[] }>(accessToken, "", {
    method: "POST",
    body: JSON.stringify({
      properties: { title, locale: rtl ? "ar_SA" : "en_US" },
      sheets: [{ properties: { title: sheetTitle, rightToLeft: rtl, gridProperties: { frozenRowCount: 1 } } }],
    }),
  });
  const sheetId = created.sheets[0].properties.sheetId;
  if (header.length) {
    await sheetsApi(accessToken, `/${created.spreadsheetId}/values/${rangeFor(sheetTitle)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ values: [header] }),
    });
    await sheetsApi(accessToken, `/${created.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.06, green: 0.11, blue: 0.18 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: "CENTER",
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
            },
          },
          { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0 } } } },
        ],
      }),
    });
  }
  return created.spreadsheetId;
}
