import { CATEGORY_LABELS, type Invoice } from "../invoice";

export type Lang = "ar" | "en";
export type ColumnKind = "text" | "money" | "date" | "index";

export type Column = {
  key: string;
  ar: string;
  en: string;
  kind: ColumnKind;
  width: number;
  value: (invoice: Invoice, index: number, lang: Lang, context: ExportContext) => string | number;
};

export type ExportContext = {
  batchNames: Record<string, string>;
};

const statusLabel = (invoice: Invoice, lang: Lang) =>
  invoice.status === "approved" ? (lang === "ar" ? "معتمدة" : "Approved") : lang === "ar" ? "بحاجة لمراجعة" : "Needs review";

const qrLabel = (invoice: Invoice, lang: Lang) => {
  if (invoice.qrStatus === "valid") return lang === "ar" ? "مطابق" : "Matches";
  if (invoice.qrStatus === "mismatch") return lang === "ar" ? "غير مطابق" : "Mismatch";
  return lang === "ar" ? "لا يوجد" : "None";
};

/** Column order used by Excel, Google Sheets and the Arabic CSV. Keep stable: users build formulas on it. */
export const INVOICE_COLUMNS: Column[] = [
  { key: "index", ar: "م", en: "#", kind: "index", width: 6, value: (_, index) => index + 1 },
  { key: "issueDate", ar: "التاريخ", en: "Date", kind: "date", width: 13, value: (invoice) => invoice.issueDate },
  { key: "invoiceNumber", ar: "رقم الفاتورة", en: "Invoice No.", kind: "text", width: 16, value: (invoice) => invoice.invoiceNumber },
  { key: "vendorName", ar: "المورد", en: "Vendor", kind: "text", width: 30, value: (invoice) => invoice.vendorName },
  { key: "vendorTaxId", ar: "الرقم الضريبي للمورد", en: "Vendor VAT No.", kind: "text", width: 19, value: (invoice) => invoice.vendorTaxId },
  { key: "customerName", ar: "العميل", en: "Customer", kind: "text", width: 24, value: (invoice) => invoice.customerName },
  { key: "projectName", ar: "المشروع / الموقع", en: "Project / Site", kind: "text", width: 22, value: (invoice) => invoice.projectName },
  { key: "category", ar: "التصنيف", en: "Category", kind: "text", width: 22, value: (invoice, _, lang) => CATEGORY_LABELS[invoice.category][lang] },
  { key: "subtotal", ar: "قبل الضريبة", en: "Subtotal", kind: "money", width: 14, value: (invoice) => invoice.subtotal },
  { key: "vat", ar: "ضريبة القيمة المضافة", en: "VAT", kind: "money", width: 14, value: (invoice) => invoice.vat },
  { key: "total", ar: "الإجمالي", en: "Total", kind: "money", width: 15, value: (invoice) => invoice.total },
  { key: "currency", ar: "العملة", en: "Currency", kind: "text", width: 9, value: (invoice) => invoice.currency },
  { key: "batch", ar: "الدفعة", en: "Batch", kind: "text", width: 20, value: (invoice, _, __, context) => (invoice.batchId ? context.batchNames[invoice.batchId] ?? "" : "") },
  { key: "status", ar: "الحالة", en: "Status", kind: "text", width: 14, value: (invoice, _, lang) => statusLabel(invoice, lang) },
  { key: "qr", ar: "رمز QR", en: "QR check", kind: "text", width: 12, value: (invoice, _, lang) => qrLabel(invoice, lang) },
  { key: "notes", ar: "ملاحظات", en: "Notes", kind: "text", width: 28, value: (invoice) => invoice.notes },
];

export function columnHeaders(lang: Lang) {
  return INVOICE_COLUMNS.map((column) => column[lang]);
}

/** Plain rows for Google Sheets (dates stay as YYYY-MM-DD strings so Sheets parses them). */
export function invoiceRows(invoices: Invoice[], lang: Lang, context: ExportContext) {
  return invoices.map((invoice, index) => INVOICE_COLUMNS.map((column) => column.value(invoice, index, lang, context)));
}

export type GroupRow = { name: string; count: number; subtotal: number; vat: number; total: number };

export function groupInvoices(invoices: Invoice[], keyOf: (invoice: Invoice) => string): GroupRow[] {
  const groups = new Map<string, GroupRow>();
  for (const invoice of invoices) {
    const name = keyOf(invoice);
    const row = groups.get(name) ?? { name, count: 0, subtotal: 0, vat: 0, total: 0 };
    row.count += 1;
    row.subtotal += invoice.subtotal;
    row.vat += invoice.vat;
    row.total += invoice.total;
    groups.set(name, row);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}
