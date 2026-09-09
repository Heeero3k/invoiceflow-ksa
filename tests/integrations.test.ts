import { describe, expect, it } from "vitest";
import { buildLocalInvoiceDraft, toGoogleSheetsRows, type CsvInvoice } from "../shared/invoice-utils";

describe("local invoice OCR", () => {
  it("extracts Saudi tax id, invoice number and totals from Arabic text", () => {
    const draft = buildLocalInvoiceDraft("شركة النور التجارية\nالرقم الضريبي: 310123456700003\nفاتورة رقم INV-77\n2026/09/09\nقبل الضريبة 100\nضريبة 15\nالإجمالي 115");
    expect(draft.vendorName).toBe("شركة النور التجارية");
    expect(draft.vendorTaxId).toBe("310123456700003");
    expect(draft.invoiceNumber).toBe("INV-77");
    expect(draft.total).toBe(115);
    expect(draft.vat).toBe(15);
  });
});

describe("Google Sheets export mapping", () => {
  it("keeps the invoice column order stable", () => {
    const invoice: CsvInvoice = {
      vendorName: "مورد", vendorTaxId: "310123456700003", invoiceNumber: "1", issueDate: "2026-09-09", projectName: "مشروع", subtotal: 100, vat: 15, total: 115, currency: "SAR", status: "reviewed",
    };
    expect(toGoogleSheetsRows([invoice])[0]).toEqual(["مورد", "310123456700003", "1", "2026-09-09", "مشروع", 100, 15, 115, "SAR", "reviewed"]);
  });
});
