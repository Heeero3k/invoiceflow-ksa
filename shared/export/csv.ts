import { CATEGORY_LABELS, type Invoice } from "../invoice";
import { INVOICE_COLUMNS, type ExportContext, type Lang } from "./columns";

function escapeCell(cell: unknown) {
  const text = String(cell ?? "");
  // Prevent CSV/formula injection when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Human-readable CSV with the same columns as the Excel register. */
export function invoicesToCsv(invoices: Invoice[], lang: Lang, context: ExportContext) {
  const header = INVOICE_COLUMNS.map((column) => column[lang]);
  const rows = invoices.map((invoice, index) => INVOICE_COLUMNS.map((column) => column.value(invoice, index, lang, context)));
  return toCsv([header, ...rows]);
}

/**
 * Import-friendly CSV for accounting software (Qoyod, Daftra, Zoho Books,
 * QuickBooks, Xero): English headers, ISO dates, plain numbers, one bill per row.
 */
export function invoicesToAccountingCsv(invoices: Invoice[]) {
  const header = ["Bill Date", "Bill Number", "Vendor Name", "Vendor VAT Number", "Project", "Category", "Description", "Subtotal", "VAT Amount", "VAT Rate", "Total", "Currency"];
  const rows = invoices.map((invoice) => [
    invoice.issueDate,
    invoice.invoiceNumber,
    invoice.vendorName,
    invoice.vendorTaxId,
    invoice.projectName,
    CATEGORY_LABELS[invoice.category].en,
    invoice.notes || CATEGORY_LABELS[invoice.category].en,
    invoice.subtotal.toFixed(2),
    invoice.vat.toFixed(2),
    invoice.subtotal ? `${Math.round((invoice.vat / invoice.subtotal) * 100)}%` : "",
    invoice.total.toFixed(2),
    invoice.currency,
  ]);
  return toCsv([header, ...rows]);
}
