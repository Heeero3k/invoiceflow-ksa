import { Linking, Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import type { Invoice } from "@/lib/invoice-context";
import { toGoogleSheetsRows } from "@/shared/invoice-utils";

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const token = await Auth.getSessionToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "تعذر تنفيذ طلب Google Sheets");
  return body;
}

export function invoicesToSheetRows(invoices: Invoice[]) {
  return toGoogleSheetsRows(invoices);
}

export async function connectGoogleSheets() {
  const returnTo = Platform.OS === "web" && typeof window !== "undefined"
    ? `${window.location.origin}/settings?sheets=connected`
    : "invoiceflow://settings?sheets=connected";
  const { url } = await apiJson<{ url: string }>(`/api/google/sheets/connect?returnTo=${encodeURIComponent(returnTo)}`);
  await Linking.openURL(url);
}

export async function getGoogleSheetsStatus() {
  return apiJson<{ connected: boolean; spreadsheetId: string | null; spreadsheetUrl: string | null }>("/api/google/sheets/status");
}

export async function exportInvoicesToGoogleSheets(invoices: Invoice[]) {
  return apiJson<{ spreadsheetId: string; spreadsheetUrl: string; updatedRange: string | null }>("/api/google/sheets/export", {
    method: "POST",
    body: JSON.stringify({
      rows: invoicesToSheetRows(invoices),
      title: "InvoiceFlow KSA — الفواتير",
    }),
  });
}
