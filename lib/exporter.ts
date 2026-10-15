import { invoicesToAccountingCsv } from "@/shared/export/csv";
import { columnHeaders, invoiceRows, type ExportContext } from "@/shared/export/columns";
import { buildInvoiceWorkbook } from "@/shared/export/xlsx";
import type { Batch, Invoice } from "@/shared/invoice";
import { sheets } from "./api";
import { createDriveFolder, getDriveAccess, uploadToDrive } from "./drive";
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
  /** Save into the user's own Google Drive (a folder per export). */
  drive: boolean;
  /** Also copy the original invoice photos/PDFs into that Drive folder. */
  driveOriginals: boolean;
  googleSheets: boolean;
  userId: string | null;
  onProgress?: (done: number, total: number) => void;
};

export type ExportResult = { driveUrl: string | null; sheetsUrl: string | null; fileName: string; originalsUploaded: number };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv";
export const SIGNED_URL_SECONDS = 7 * 24 * 3600;

function sortForExport(invoices: Invoice[]) {
  return [...invoices].sort((a, b) => (a.issueDate || a.createdAt).localeCompare(b.issueDate || b.createdAt));
}

/** "003 - Vendor - INV-12.jpg" so originals sort in the same order as the Excel rows. */
function originalName(invoice: Invoice, index: number) {
  const parts = [String(index + 1).padStart(3, "0"), invoice.vendorName, invoice.invoiceNumber].filter(Boolean).join(" - ");
  return `${safeFileName(parts)}.${invoice.source === "pdf" ? "pdf" : "jpg"}`;
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

  let driveUrl: string | null = null;
  let sheetsUrl: string | null = null;
  let originalsUploaded = 0;

  if (request.drive) {
    const access = await getDriveAccess();
    const folder = await createDriveFolder(access, baseName);
    const originals = request.driveOriginals ? invoices.filter((invoice) => invoice.localUri) : [];
    const total = 1 + originals.length;
    request.onProgress?.(0, total);
    await uploadToDrive(access, { name: fileName, mimeType, parentId: folder.id, bytes: data });
    request.onProgress?.(1, total);
    if (originals.length) {
      const originalsFolder = await createDriveFolder(access, request.language === "ar" ? "الفواتير الأصلية" : "Original invoices", folder.id);
      for (const invoice of originals) {
        const index = invoices.indexOf(invoice);
        try {
          await uploadToDrive(access, {
            name: originalName(invoice, index),
            mimeType: invoice.source === "pdf" ? "application/pdf" : "image/jpeg",
            parentId: originalsFolder.id,
            uri: invoice.localUri!,
          });
          originalsUploaded += 1;
        } catch (error) {
          // One unreadable photo should not fail the whole export.
          console.warn("[drive] original upload failed", error);
        }
        request.onProgress?.(1 + originalsUploaded, total);
      }
    }
    driveUrl = folder.webViewLink;
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

  if (request.userId && (driveUrl || sheetsUrl)) {
    const total = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
    await supabase.from("exports").insert({ name: fileName, drive_url: driveUrl, sheets_url: sheetsUrl, invoice_count: invoices.length, total });
  }

  if (request.share) {
    await shareGeneratedFile(fileName, mimeType, data);
  }

  return { driveUrl, sheetsUrl, fileName, originalsUploaded };
}

/** Legacy exports stored in the private Supabase bucket. */
export async function signedExportUrl(path: string, name: string) {
  const { data, error } = await supabase.storage.from("exports").createSignedUrl(path, SIGNED_URL_SECONDS, { download: name });
  if (error) throw error;
  return data.signedUrl;
}
