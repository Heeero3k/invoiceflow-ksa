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
