// Core invoice model shared by the app, the exporters and the tests.

export type InvoiceStatus = "needs-review" | "approved";
export type InvoiceSource = "camera" | "gallery" | "pdf" | "manual";
export type QrStatus = "none" | "valid" | "mismatch";

export type Invoice = {
  id: string;
  batchId: string | null;
  vendorName: string;
  vendorTaxId: string;
  customerName: string;
  customerTaxId: string;
  invoiceNumber: string;
  /** Gregorian date, YYYY-MM-DD, or "" when unknown. */
  issueDate: string;
  projectName: string;
  category: CategoryKey;
  subtotal: number;
  vat: number;
  total: number;
  currency: string;
  notes: string;
  status: InvoiceStatus;
  confidence: number;
  source: InvoiceSource;
  qrStatus: QrStatus;
  warnings: string[];
  /** Local file on this device (photo or PDF). */
  localUri: string | null;
  /** Path inside the private `invoice-files` bucket once uploaded. */
  filePath: string | null;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Batch = {
  id: string;
  name: string;
  exportedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const CATEGORY_KEYS = [
  "materials",
  "equipment",
  "subcontract",
  "services",
  "transport",
  "fuel",
  "utilities",
  "rent",
  "maintenance",
  "office",
  "hospitality",
  "government",
  "other",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const CATEGORY_LABELS: Record<CategoryKey, { ar: string; en: string; icon: string }> = {
  materials: { ar: "مواد بناء وتوريدات", en: "Materials & supplies", icon: "cube-outline" },
  equipment: { ar: "معدات وتأجير آليات", en: "Equipment & rental", icon: "excavator" },
  subcontract: { ar: "مقاولو باطن", en: "Subcontractors", icon: "account-hard-hat-outline" },
  services: { ar: "خدمات مهنية", en: "Professional services", icon: "briefcase-outline" },
  transport: { ar: "نقل وشحن", en: "Transport & freight", icon: "truck-outline" },
  fuel: { ar: "وقود", en: "Fuel", icon: "gas-station-outline" },
  utilities: { ar: "كهرباء ومياه واتصالات", en: "Utilities & telecom", icon: "lightning-bolt-outline" },
  rent: { ar: "إيجارات", en: "Rent", icon: "home-city-outline" },
  maintenance: { ar: "صيانة وإصلاح", en: "Maintenance & repair", icon: "wrench-outline" },
  office: { ar: "مستلزمات مكتبية", en: "Office supplies", icon: "paperclip" },
  hospitality: { ar: "ضيافة وإعاشة", en: "Hospitality & meals", icon: "silverware-fork-knife" },
  government: { ar: "رسوم حكومية", en: "Government fees", icon: "bank-outline" },
  other: { ar: "أخرى", en: "Other", icon: "dots-horizontal-circle-outline" },
};

export function isCategoryKey(value: unknown): value is CategoryKey {
  return typeof value === "string" && (CATEGORY_KEYS as readonly string[]).includes(value);
}

export const VAT_RATE = 0.15;

export function newId() {
  // RFC 4122 v4 from Math.random is fine for client-generated row ids.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function emptyInvoice(partial: Partial<Invoice> = {}): Invoice {
  const now = new Date().toISOString();
  return {
    id: newId(),
    batchId: null,
    vendorName: "",
    vendorTaxId: "",
    customerName: "",
    customerTaxId: "",
    invoiceNumber: "",
    issueDate: "",
    projectName: "",
    category: "other",
    subtotal: 0,
    vat: 0,
    total: 0,
    currency: "SAR",
    notes: "",
    status: "needs-review",
    confidence: 0,
    source: "manual",
    qrStatus: "none",
    warnings: [],
    localUri: null,
    filePath: null,
    exportedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Converts Arabic-Indic and Persian digits to ASCII digits. */
export function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

export function parseAmount(value: string) {
  const cleaned = normalizeDigits(value).replace(/[^\d.-]/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isValidSaudiTaxId(value: string) {
  return /^3\d{13}3$/.test(normalizeDigits(value).trim());
}

/** Normalizes common date shapes to YYYY-MM-DD; returns the input when unsure. */
export function normalizeDate(value: string) {
  const text = normalizeDigits(value).trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return text;
}

export type AmountCheck = "ok" | "sum-mismatch" | "vat-unusual" | "empty";

/** Accountant sanity checks for the amount block. */
export function checkAmounts(invoice: Pick<Invoice, "subtotal" | "vat" | "total">): AmountCheck {
  const { subtotal, vat, total } = invoice;
  if (!total) return "empty";
  if (subtotal && Math.abs(round2(subtotal + vat) - total) > 0.05) return "sum-mismatch";
  if (subtotal && vat && Math.abs(round2(subtotal * VAT_RATE) - vat) > Math.max(0.05, subtotal * 0.002)) return "vat-unusual";
  return "ok";
}

/** Fields an accountant must not leave empty before approving. */
export function missingRequiredFields(invoice: Invoice) {
  const missing: ("vendorName" | "issueDate" | "total")[] = [];
  if (!invoice.vendorName.trim()) missing.push("vendorName");
  if (!invoice.issueDate.trim()) missing.push("issueDate");
  if (!invoice.total) missing.push("total");
  return missing;
}

export const HIGH_CONFIDENCE = 0.85;

/** True when an AI-read invoice can be approved in bulk without opening it. */
export function isSafeToBulkApprove(invoice: Invoice) {
  return (
    invoice.status === "needs-review" &&
    invoice.confidence >= HIGH_CONFIDENCE &&
    missingRequiredFields(invoice).length === 0 &&
    checkAmounts(invoice) === "ok" &&
    (!invoice.vendorTaxId || isValidSaudiTaxId(invoice.vendorTaxId))
  );
}
