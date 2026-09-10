export type CsvInvoice = {
  vendorName: string;
  customerName?: string;
  vendorTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  subtotal: number;
  vat: number;
  total: number;
  currency: string;
  status: string;
  category?: string;
  qrStatus?: string;
};

export const invoiceCsvHeaders = [
  "اسم المورد",
  "اسم العميل",
  "الرقم الضريبي",
  "رقم الفاتورة",
  "التاريخ",
  "المشروع",
  "قبل الضريبة",
  "الضريبة",
  "الإجمالي",
  "العملة",
  "الحالة",
  "التصنيف",
  "حالة QR / ZATCA",
];

export function isValidSaudiTaxId(value: string) {
  return /^\d{15}$/.test(value.trim());
}

export function toInvoiceCsv(invoices: CsvInvoice[]) {
  const escape = (cell: unknown) => `"${String(cell ?? "").replaceAll('"', '""')}"`;
  const rows = invoices.map((item) => [item.vendorName, item.customerName ?? "", item.vendorTaxId, item.invoiceNumber, item.issueDate, item.projectName, item.subtotal, item.vat, item.total, item.currency, item.status, item.category ?? "غير مصنف", item.qrStatus ?? "غير مفحوص"]);
  return [invoiceCsvHeaders, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export function toGoogleSheetsRows(invoices: CsvInvoice[]) {
  return invoices.map((invoice) => [invoice.vendorName, invoice.customerName ?? "", invoice.vendorTaxId, invoice.invoiceNumber, invoice.issueDate, invoice.projectName, invoice.subtotal, invoice.vat, invoice.total, invoice.currency, invoice.status, invoice.category ?? "غير مصنف", invoice.qrStatus ?? "غير مفحوص"] as const);
}

export function decodeSaudiQrPayload(payload: string) {
  try {
    const binary = globalThis.atob(payload);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
    const fields: Record<number, string> = {};
    let offset = 0;
    while (offset + 2 <= bytes.length) {
      const tag = bytes[offset];
      const length = bytes[offset + 1];
      offset += 2;
      const valueBytes = bytes.slice(offset, offset + length);
      fields[tag] = decoder ? decoder.decode(valueBytes) : String.fromCharCode(...valueBytes);
      offset += length;
    }
    if (!fields[1] && !fields[2] && !fields[4]) return null;
    return {
      vendorName: fields[1] ?? "",
      vendorTaxId: fields[2] ?? "",
      issueDate: fields[3] ?? "",
      total: Number(fields[4] ?? 0) || 0,
      vat: Number(fields[5] ?? 0) || 0,
      subtotal: Math.max((Number(fields[4] ?? 0) || 0) - (Number(fields[5] ?? 0) || 0), 0),
      currency: "SAR",
      confidence: 0.92,
      category: "مشتريات / فاتورة ضريبية",
      qrStatus: /^\d{15}$/.test(fields[2] ?? "") && Number(fields[4] ?? 0) > 0 ? "مطابق بنيوياً" : "يحتاج مراجعة",
      warnings: ["تمت قراءة QR وفق حقول الفاتورة الإلكترونية السعودية. هذا لا يثبت أصالة الفاتورة لدى ZATCA دون ربط رسمي بصلاحيات المنشأة."],
    };
  } catch {
    return null;
  }
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
  const projectLine = normalized.split("\n").map((line) => line.trim()).find((line) => /(?:مشروع|project|موقع|site)/i.test(line)) ?? "";
  return { vendorName: firstMeaningfulLine, customerName: "", vendorTaxId: taxId, invoiceNumber, issueDate: date, projectName: projectLine.replace(/(?:مشروع|project|موقع|site)\s*[:#-]?\s*/i, ""), subtotal, vat, total, currency: "SAR", category: "مشتريات / فاتورة ضريبية", qrStatus: "غير مفحوص", confidence: taxId && total ? 0.64 : 0.42, warnings: ["تم استخراج الحقول محلياً؛ راجعها قبل الحفظ."] };
}
