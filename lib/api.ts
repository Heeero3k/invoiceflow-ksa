import { FunctionsHttpError } from "@supabase/supabase-js";
import type { StringKey } from "./strings";
import { isBackendConfigured, supabase } from "./supabase";
import type { ExtractedFields } from "@/shared/invoice-utils";

/** Error carrying a backend error code that maps to `err_<code>` copy. */
export class ApiError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }

  get messageKey(): StringKey {
    const key = `err_${this.code}`;
    return (key in ERROR_KEYS ? key : "err_internal") as StringKey;
  }
}

const ERROR_KEYS = {
  err_quota_exceeded: 1,
  err_not_invoice: 1,
  err_file_too_large: 1,
  err_unsupported_file: 1,
  err_busy: 1,
  err_ai_failed: 1,
  err_refused: 1,
  err_offline: 1,
  err_not_configured: 1,
  err_unauthorized: 1,
  err_sheets_not_connected: 1,
  err_sheets_reconnect: 1,
  err_internal: 1,
};

export function errorKey(error: unknown): StringKey {
  return error instanceof ApiError ? error.messageKey : "err_internal";
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!isBackendConfigured) throw new ApiError("not_configured");
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new ApiError(payload?.error ?? "internal", payload?.message);
    }
    // FunctionsFetchError / FunctionsRelayError: network or platform problem.
    throw new ApiError("offline", error.message);
  }
  return data as T;
}

export type ExtractResult = ExtractedFields & { isInvoice: boolean; model?: string };

export function extractInvoice(file: string, mimeType: string, language: "ar" | "en") {
  return invoke<ExtractResult>("extract-invoice", { file, mimeType, language });
}

export type SheetsStatus = { configured: boolean; connected: boolean; googleEmail: string | null; spreadsheetUrl: string | null; driveFolderUrl: string | null };
export type DriveAccess = { accessToken: string; folderId: string; folderUrl: string | null };

export const sheets = {
  status: () => invoke<SheetsStatus>("sheets", { action: "status" }),
  connect: (returnTo: string) => invoke<{ url: string }>("sheets", { action: "connect", returnTo }),
  disconnect: () => invoke<{ connected: false }>("sheets", { action: "disconnect" }),
  storeToken: (refreshToken: string) => invoke<{ connected: true }>("sheets", { action: "store_token", refreshToken }),
  driveAccess: () => invoke<DriveAccess>("sheets", { action: "drive_access" }),
  export: (payload: { rows: (string | number)[][]; header: string[]; title: string; sheetTitle: string; rtl: boolean }) =>
    invoke<{ spreadsheetUrl: string; updatedRange: string | null }>("sheets", { action: "export", ...payload }),
};

export function deleteAccount() {
  return invoke<{ deleted: true }>("delete-account", {});
}
