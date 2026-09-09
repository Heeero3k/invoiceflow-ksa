import { describe, expect, it } from "vitest";
import { isValidSaudiTaxId, toInvoiceCsv } from "../shared/invoice-utils";

describe("invoice utilities", () => {
  it("accepts only 15-digit Saudi tax identifiers", () => {
    expect(isValidSaudiTaxId("310123456700003")).toBe(true);
    expect(isValidSaudiTaxId("3101234567")).toBe(false);
    expect(isValidSaudiTaxId("31012345670000A")).toBe(false);
  });

  it("creates an escaped CSV with the invoice schema", () => {
    const csv = toInvoiceCsv([
      {
        vendorName: 'شركة "النور"',
        vendorTaxId: "310123456700003",
        invoiceNumber: "INV-42",
        issueDate: "2026-09-09",
        projectName: "مشروع الرياض",
        subtotal: 100,
        vat: 15,
        total: 115,
        currency: "SAR",
        status: "reviewed",
      },
    ]);

    expect(csv).toContain("اسم المورد");
    expect(csv).toContain('"شركة ""النور"""');
    expect(csv.split("\n")).toHaveLength(2);
  });
});
