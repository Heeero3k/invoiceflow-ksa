import { describe, expect, it } from "vitest";
import { checkAmounts, emptyInvoice, isSafeToBulkApprove, isValidSaudiTaxId, normalizeDate, parseAmount } from "../shared/invoice";
import { buildLocalInvoiceDraft, compareWithQr, decodeSaudiQrPayload, guessCategory, mergeQr } from "../shared/invoice-utils";

function qrPayload(fields: string[]) {
  const raw = Buffer.concat(
    fields.map((value, index) => {
      const bytes = Buffer.from(value, "utf8");
      return Buffer.concat([Buffer.from([index + 1, bytes.length]), bytes]);
    }),
  );
  return raw.toString("base64");
}

describe("invoice rules", () => {
  it("validates Saudi VAT numbers (15 digits, starts and ends with 3)", () => {
    expect(isValidSaudiTaxId("310123456700003")).toBe(true);
    expect(isValidSaudiTaxId("٣١٠١٢٣٤٥٦٧٠٠٠٠٣")).toBe(true);
    expect(isValidSaudiTaxId("210123456700003")).toBe(false);
    expect(isValidSaudiTaxId("3101234567")).toBe(false);
  });

  it("parses amounts and dates in Arabic digits", () => {
    expect(parseAmount("١٬٢٣٤٫٥٠")).toBe(1234.5);
    expect(parseAmount("1,150.00 SAR")).toBe(1150);
    expect(normalizeDate("9/9/2026")).toBe("2026-09-09");
    expect(normalizeDate("٢٠٢٦/٠٩/٠٩")).toBe("2026-09-09");
  });

  it("flags inconsistent amounts", () => {
    expect(checkAmounts({ subtotal: 100, vat: 15, total: 115 })).toBe("ok");
    expect(checkAmounts({ subtotal: 100, vat: 15, total: 120 })).toBe("sum-mismatch");
    expect(checkAmounts({ subtotal: 100, vat: 5, total: 105 })).toBe("vat-unusual");
    expect(checkAmounts({ subtotal: 0, vat: 0, total: 0 })).toBe("empty");
  });

  it("only bulk-approves complete, consistent, high-confidence invoices", () => {
    const good = emptyInvoice({ vendorName: "A", issueDate: "2026-01-01", subtotal: 100, vat: 15, total: 115, confidence: 0.95, vendorTaxId: "310123456700003" });
    expect(isSafeToBulkApprove(good)).toBe(true);
    expect(isSafeToBulkApprove({ ...good, confidence: 0.6 })).toBe(false);
    expect(isSafeToBulkApprove({ ...good, total: 999 })).toBe(false);
    expect(isSafeToBulkApprove({ ...good, vendorName: "" })).toBe(false);
  });
});

describe("Saudi e-invoice QR", () => {
  const payload = qrPayload(["شركة المورد", "310123456700003", "2026-09-09T08:00:00Z", "115.00", "15.00"]);

  it("decodes TLV fields", () => {
    expect(decodeSaudiQrPayload(payload)).toEqual({ vendorName: "شركة المورد", vendorTaxId: "310123456700003", issueDate: "2026-09-09", total: 115, vat: 15 });
    expect(decodeSaudiQrPayload("not-a-qr")).toBeNull();
  });

  it("compares and merges QR data with extracted fields", () => {
    const qr = decodeSaudiQrPayload(payload)!;
    const extracted = buildLocalInvoiceDraft("");
    expect(compareWithQr({ vendorTaxId: "310123456700003", total: 115, vat: 15 }, qr)).toBe("valid");
    expect(compareWithQr({ vendorTaxId: "310123456700003", total: 200, vat: 15 }, qr)).toBe("mismatch");
    const merged = mergeQr(extracted, qr);
    expect(merged.vendorName).toBe("شركة المورد");
    expect(merged.subtotal).toBe(100);
  });
});

describe("on-device OCR parsing", () => {
  it("extracts Saudi tax id, invoice number and totals from Arabic text", () => {
    const draft = buildLocalInvoiceDraft("شركة النور التجارية\nالرقم الضريبي: 310123456700003\nفاتورة رقم INV-77\n2026/09/09\nقبل الضريبة 100\nضريبة 15\nالإجمالي 115");
    expect(draft.vendorName).toBe("شركة النور التجارية");
    expect(draft.vendorTaxId).toBe("310123456700003");
    expect(draft.invoiceNumber).toBe("INV-77");
    expect(draft.issueDate).toBe("2026-09-09");
    expect(draft.total).toBe(115);
    expect(draft.vat).toBe(15);
    expect(draft.subtotal).toBe(100);
  });
});

describe("free category guess", () => {
  it("maps common invoice words to expense categories", () => {
    expect(guessCategory("محطة وقود الدريس\nديزل 200 لتر")).toBe("fuel");
    expect(guessCategory("Cement bags 50kg")).toBe("materials");
    expect(guessCategory("Crane rental 3 days")).toBe("equipment");
    expect(guessCategory("مطعم البيك")).toBe("hospitality");
    expect(guessCategory("random text")).toBe("other");
  });
});
