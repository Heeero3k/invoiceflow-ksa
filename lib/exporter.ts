import { invoicesToAccountingCsv } from "@/shared/export/csv";
import { columnHeaders, invoiceRows, type ExportContext } from "@/shared/export/columns";
import { buildInvoiceWorkbook } from "@/shared/export/xlsx";
import type { Batch, Invoice } from "@/shared/invoice";
import { sheets } from "./api";
import { safeFileName, shareGeneratedFile } from "./files";
import type { Language } from "./preferences";
import { supabase } from "./supabase";

export type ExportFormat = "xlsx" | "csv";
export type ExportRequest = {
  invoices: Invoice[];
  batches: Batch[];
  title: string;
  format: ExportFormat;
  language: Language;
  share: boolean;
  cloud: boolean;
  googleSheets: boolean;
  userId: string | null;
};

export type ExportResult = { cloudUrl: string | null; sheetsUrl: string | null; fileName: string };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv";
export const SIGNED_URL_SECONDS = 7 * 24 * 3600;

function sortForExport(invoices: Invoice[]) {
  return [...invoices].sort((a, b) => (a.issueDate || a.createdAt).localeCompare(b.issueDate || b.createdAt));
}

export async function runExport(request: ExportRequest): Promise<ExportResult> {
  const invoices = sortForExport(request.invoices);
  const context: ExportContext = { batchNames: Object.fromEntries(request.batches.map((batch) => [batch.id, batch.name])) };
  const baseName = `${safeFileName(request.title)} ${new Date().toISOString().slice(0, 10)}`;
  const fileName = `${baseName}.${request.format}`;
  const mimeType = request.format === "xlsx" ? XLSX_MIME : CSV_MIME;
  const data =
    request.format === "xlsx"
      ? buildInvoiceWorkbook(invoices, { title: request.title, lang: request.language, context })
      : new TextEncoder().encode(`﻿${invoicesToAccountingCsv(invoices)}`);

  let cloudUrl: string | null = null;
  let sheetsUrl: string | null = null;

  if (request.cloud && request.userId) {
    const path = `${request.userId}/${Date.now()}-${fileName.replace(/[^\w.\- ؀-ۿ]/g, "")}`;
    const { error } = await supabase.storage.from("exports").upload(path, data, { contentType: mimeType, upsert: false });
    if (error) throw error;
    const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    await supabase.from("exports").insert({ name: fileName, file_path: path, invoice_count: invoices.length, total });
    const { data: signed } = await supabase.storage.from("exports").createSignedUrl(path, SIGNED_URL_SECONDS, { download: fileName });
    cloudUrl = signed?.signedUrl ?? null;
  }

  if (request.googleSheets) {
    const result = await sheets.export({
      rows: invoiceRows(invoices, request.language, context),
      header: columnHeaders(request.language),
      title: request.language === "ar" ? "InvoiceFlow KSA — سجل الفواتير" : "InvoiceFlow KSA — Invoice register",
      sheetTitle: request.language === "ar" ? "الفواتير" : "Invoices",
      rtl: request.language === "ar",
    });
    sheetsUrl = result.spreadsheetUrl;
  }

  if (request.share) {
    await shareGeneratedFile(fileName, mimeType, data);
  }

  return { cloudUrl, sheetsUrl, fileName };
}

export async function signedExportUrl(path: string, name: string) {
  const { data, error } = await supabase.storage.from("exports").createSignedUrl(path, SIGNED_URL_SECONDS, { download: name });
  if (error) throw error;
  return data.signedUrl;
}
