export type CsvInvoice = {
  vendorName: string;
  vendorTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  subtotal: number;
  vat: number;
  total: number;
  currency: string;
  status: string;
};

export const invoiceCsvHeaders = [
  "اسم المورد",
  "الرقم الضريبي",
  "رقم الفاتورة",
  "التاريخ",
  "المشروع",
  "قبل الضريبة",
  "الضريبة",
  "الإجمالي",
  "العملة",
  "الحالة",
];

export function isValidSaudiTaxId(value: string) {
  return /^\d{15}$/.test(value.trim());
}

export function toInvoiceCsv(invoices: CsvInvoice[]) {
  const escape = (cell: unknown) => `"${String(cell ?? "").replaceAll('"', '""')}"`;
  const rows = invoices.map((item) => [item.vendorName, item.vendorTaxId, item.invoiceNumber, item.issueDate, item.projectName, item.subtotal, item.vat, item.total, item.currency, item.status]);
  return [invoiceCsvHeaders, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function toGoogleSheetsRows(invoices: CsvInvoice[]) {
  return invoices.map((invoice) => [invoice.vendorName, invoice.vendorTaxId, invoice.invoiceNumber, invoice.issueDate, invoice.projectName, invoice.subtotal, invoice.vat, invoice.total, invoice.currency, invoice.status] as const);
}

export function buildLocalInvoiceDraft(text: string) {
  const normalized = text.replace(/\r/g, "\n").replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0));
  const numbers = normalized.match(/\d+[,.]?\d*/g)?.map((value) => Number(value.replace(/,/g, ""))) ?? [];
  const taxId = normalized.match(/\b\d{15}\b/)?.[0] ?? "";
  const invoiceNumber = normalized.match(/(?:invoice|فاتورة|رقم)\s*[:#-]?\s*([A-Za-z0-9-]+)/i)?.[1] ?? "";
  const date = normalized.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b/)?.[1] ?? "";
  const amountNumbers = numbers.filter((value) => String(Math.trunc(value)).length < 15);
  const amountAfter = (pattern: RegExp) => {
    const value = normalized.match(pattern)?.[1];
    return value ? Number(value.replace(/,/g, "")) : undefined;
  };
  const labeledSubtotal = amountAfter(/(?:قبل\s+الضريبة|subtotal|net)\s*[:#-]?\s*([\d,.]+)/i);
  const labeledVat = amountAfter(/(?:^|\n)\s*(?:ضريبة|vat|tax)\s*[:#-]?\s*([\d,.]+)/im);
  const labeledTotal = amountAfter(/(?:الإجمالي|total)\s*[:#-]?\s*([\d,.]+)/i);
  const total = labeledTotal ?? (amountNumbers.length ? Math.max(...amountNumbers) : 0);
  const vat = labeledVat ?? amountNumbers.find((value) => value > 0 && value <= total && (value / Math.max(total - value, 1) > 0.1 && value / Math.max(total - value, 1) < 0.2)) ?? 0;
  const subtotal = labeledSubtotal ?? Math.max(total - vat, 0);
  const firstMeaningfulLine = normalized.split("\n").map((line) => line.trim()).find((line) => line.length > 2 && !/\d/.test(line)) ?? "";
  return { vendorName: firstMeaningfulLine, vendorTaxId: taxId, invoiceNumber, issueDate: date, projectName: "", subtotal, vat, total, currency: "SAR", confidence: taxId && total ? 0.64 : 0.42, warnings: ["تم استخراج الحقول محلياً؛ راجعها قبل الحفظ."] };
}
