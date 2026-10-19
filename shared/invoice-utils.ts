import { isValidSaudiTaxId, normalizeDate, normalizeDigits, round2, type CategoryKey, type QrStatus } from "./invoice";

export type ExtractedFields = {
  vendorName: string;
  vendorTaxId: string;
  customerName: string;
  customerTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  category: CategoryKey;
  subtotal: number;
  vat: number;
  total: number;
  currency: string;
  confidence: number;
  warnings: string[];
};

export type SaudiQrFields = {
  vendorName: string;
  vendorTaxId: string;
  issueDate: string;
  total: number;
  vat: number;
};

/**
 * Decodes the ZATCA e-invoice QR (base64 TLV: 1 seller, 2 VAT no., 3 timestamp,
 * 4 total, 5 VAT). This is a structural read, not an official ZATCA verification.
 */
export function decodeSaudiQrPayload(payload: string): SaudiQrFields | null {
  try {
    const binary = globalThis.atob(payload.trim());
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoder = new TextDecoder();
    const fields: Record<number, string> = {};
    let offset = 0;
    while (offset + 2 <= bytes.length) {
      const tag = bytes[offset];
      const length = bytes[offset + 1];
      offset += 2;
      if (offset + length > bytes.length) break;
      fields[tag] = decoder.decode(bytes.slice(offset, offset + length));
      offset += length;
    }
    if (!fields[1] || !fields[2] || !fields[4]) return null;
    return {
      vendorName: fields[1],
      vendorTaxId: normalizeDigits(fields[2]),
      issueDate: normalizeDate((fields[3] ?? "").slice(0, 10)),
      total: Number(fields[4]) || 0,
      vat: Number(fields[5] ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/** Compares QR values with the extracted fields. */
export function compareWithQr(fields: Pick<ExtractedFields, "vendorTaxId" | "total" | "vat">, qr: SaudiQrFields): QrStatus {
  const taxMatch = !fields.vendorTaxId || fields.vendorTaxId === qr.vendorTaxId;
  const totalMatch = !fields.total || Math.abs(fields.total - qr.total) < 0.05;
  const vatMatch = !fields.vat || Math.abs(fields.vat - qr.vat) < 0.05;
  return taxMatch && totalMatch && vatMatch && isValidSaudiTaxId(qr.vendorTaxId) ? "valid" : "mismatch";
}

/** Fills empty extracted fields from the QR, which is authoritative for these values. */
export function mergeQr(fields: ExtractedFields, qr: SaudiQrFields): ExtractedFields {
  const total = qr.total || fields.total;
  const vat = qr.vat || fields.vat;
  return {
    ...fields,
    vendorName: fields.vendorName || qr.vendorName,
    vendorTaxId: qr.vendorTaxId || fields.vendorTaxId,
    issueDate: fields.issueDate || qr.issueDate,
    total,
    vat,
    subtotal: fields.subtotal || round2(Math.max(total - vat, 0)),
  };
}

const CATEGORY_HINTS: [CategoryKey, RegExp][] = [
  ["fuel", /(fuel|diesel|gasoline|petrol|benzine|وقود|بنزين|ديزل|محطة)/i],
  ["materials", /(cement|concrete|steel|rebar|block|sand|pipe|cable|اسمنت|إسمنت|خرسانة|حديد|بلك|رمل|مواسير|كابل)/i],
  ["equipment", /(rental|rent of|crane|excavator|loader|generator|تأجير|رافعة|حفار|شيول|مولد)/i],
  ["transport", /(transport|freight|shipping|logistics|trailer|نقل|شحن)/i],
  ["utilities", /(electricity|water bill|internet|\bstc\b|mobily|zain|كهرباء|مياه|اتصالات)/i],
  ["maintenance", /(maintenance|repair|spare parts|service center|صيانة|إصلاح|قطع غيار)/i],
  ["hospitality", /(restaurant|cafe|coffee|catering|hotel|مطعم|مقهى|كافيه|فندق|إعاشة)/i],
  ["office", /(stationery|printer|toner|paper|قرطاسية|أحبار|مكتبية)/i],
  ["government", /(government|municipality|baladi|muqeem|jawazat|بلدية|حكومي|رسوم|مقيم|جوازات)/i],
];

/** Free keyword guess for the expense category; the user can change it on review. */
export function guessCategory(text: string): CategoryKey {
  return CATEGORY_HINTS.find(([, pattern]) => pattern.test(text))?.[0] ?? "other";
}

/** Best-effort offline parse of on-device OCR text. Always reviewed by the user. */
export function buildLocalInvoiceDraft(text: string): ExtractedFields {
  const normalized = normalizeDigits(text.replace(/\r/g, "\n"));
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const taxId = normalized.match(/\b3\d{13}3\b/)?.[0] ?? normalized.match(/\b\d{15}\b/)?.[0] ?? "";
  const invoiceNumber = normalized.match(/(?:invoice\s*(?:no|number|#)?|رقم\s*الفاتورة|فاتورة\s*رقم)\s*[:#.-]?\s*([A-Za-z0-9/-]+)/i)?.[1] ?? "";
  const date = normalized.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/)?.[1] ?? "";
  const amountAfter = (pattern: RegExp) => {
    const value = normalized.match(pattern)?.[1];
    return value ? Number(value.replace(/,/g, "")) : undefined;
  };
  const amounts = (normalized.match(/\d[\d,]*\.?\d*/g) ?? [])
    .map((value) => Number(value.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && String(Math.trunc(value)).length < 12);
  const labeledSubtotal = amountAfter(/(?:قبل\s*الضريبة|غير\s*شامل|subtotal|total\s*excl[a-z.]*|net)\s*[:#-]?\s*(?:SAR|ر\.?س\.?)?\s*([\d,]+\.?\d*)/i);
  const vatLine = lines.find((line) => /(?:ضريبة|vat|tax)/i.test(line) && !/(?:قبل|غير\s*شامل|شامل|excl|incl|subtotal|total|الإجمالي|الاجمالي|رقم|number|no\.)/i.test(line));
  const labeledVat = vatLine ? Number(vatLine.replace(/15\s*%/, "").match(/([\d,]+\.?\d*)\s*(?:SAR|ر\.?س\.?)?\s*$/)?.[1]?.replace(/,/g, "") ?? NaN) : undefined;
  const labeledTotal = amountAfter(/(?:الإجمالي|الاجمالي|المجموع|total)(?:\s*شامل[^\d\n]*|\s*incl[a-z.]*\s*vat)?\s*[:#-]?\s*(?:SAR|ر\.?س\.?)?\s*([\d,]+\.?\d*)/i);
  const total = labeledTotal ?? (amounts.length ? Math.max(...amounts) : 0);
  const vat = labeledVat !== undefined && Number.isFinite(labeledVat) ? labeledVat : 0;
  const subtotal = labeledSubtotal ?? (total && vat ? round2(total - vat) : 0);
  const vendorName = lines.find((line) => line.length > 2 && !/\d/.test(line)) ?? "";
  const projectLine = lines.find((line) => /(?:مشروع|project|موقع|site)/i.test(line)) ?? "";
  return {
    vendorName,
    vendorTaxId: taxId,
    customerName: "",
    customerTaxId: "",
    invoiceNumber,
    issueDate: normalizeDate(date),
    projectName: projectLine.replace(/^.*?(?:مشروع|project|موقع|site)\s*[:#-]?\s*/i, ""),
    category: guessCategory(normalized),
    subtotal,
    vat,
    total,
    currency: "SAR",
    confidence: taxId && total ? 0.55 : 0.35,
    warnings: [],
  };
}
