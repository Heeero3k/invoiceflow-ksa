import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { invoicesToAccountingCsv, invoicesToCsv } from "../shared/export/csv";
import { columnHeaders, invoiceRows } from "../shared/export/columns";
import { buildInvoiceWorkbook, columnLetter, excelDateSerial } from "../shared/export/xlsx";
import { emptyInvoice } from "../shared/invoice";

const sample = [
  emptyInvoice({ vendorName: 'شركة "النور" & أبناؤه', vendorTaxId: "310123456700003", invoiceNumber: "INV-1", issueDate: "2026-09-09", projectName: "برج الرياض", category: "materials", subtotal: 100, vat: 15, total: 115, batchId: "b1" }),
  emptyInvoice({ vendorName: "Fuel Co", invoiceNumber: "F-9", issueDate: "2026-09-10", category: "fuel", subtotal: 200, vat: 30, total: 230, status: "approved" }),
];
const context = { batchNames: { b1: "زيارة الموقع" } };

describe("xlsx workbook", () => {
  const zip = unzipSync(buildInvoiceWorkbook(sample, { title: "دفعة سبتمبر", lang: "ar", context, generatedAt: new Date("2026-10-15") }));

  it("contains the OOXML parts and four sheets", () => {
    expect(Object.keys(zip)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet4.xml"]));
    const workbook = strFromU8(zip["xl/workbook.xml"]);
    expect(workbook).toContain('name="الفواتير"');
    expect(workbook).toContain('name="حسب التصنيف"');
    expect(workbook).toContain("_xlnm._FilterDatabase");
  });

  it("escapes text, writes real dates, numbers and total formulas, right-to-left", () => {
    const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain("شركة &quot;النور&quot; &amp; أبناؤه");
    expect(sheet).toContain(`<v>${excelDateSerial("2026-09-09")}</v>`);
    expect(sheet).toContain("<f>SUBTOTAL(9,K5:K6)</f><v>345</v>");
    expect(sheet).toContain("زيارة الموقع");
    expect(sheet).toContain("مواد بناء وتوريدات");
  });

  it("summarises by category with shares", () => {
    const summary = strFromU8(zip["xl/worksheets/sheet2.xml"]);
    expect(summary).toContain("وقود");
    expect(summary).toContain("<f>SUM(E2:E3)</f><v>345</v>");
  });

  it("builds an English workbook", () => {
    const english = unzipSync(buildInvoiceWorkbook(sample, { title: "September", lang: "en", context }));
    const sheet = strFromU8(english["xl/worksheets/sheet1.xml"]);
    expect(sheet).not.toContain("rightToLeft");
    expect(sheet).toContain("Materials &amp; supplies");
  });

  it("handles an empty export", () => {
    expect(() => buildInvoiceWorkbook([], { title: "Empty", lang: "en", context })).not.toThrow();
  });
});

describe("helpers", () => {
  it("computes column letters and Excel serial dates", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(excelDateSerial("1900-03-01")).toBe(61);
    expect(excelDateSerial("2026-01-01")).toBe(46023);
    expect(excelDateSerial("01/01/2026")).toBeNull();
  });
});

describe("csv + sheets rows", () => {
  it("keeps Sheets rows aligned with headers", () => {
    const rows = invoiceRows(sample, "ar", context);
    expect(rows[0]).toHaveLength(columnHeaders("ar").length);
    expect(rows[0].slice(0, 4)).toEqual([1, "2026-09-09", "INV-1", 'شركة "النور" & أبناؤه']);
  });

  it("escapes quotes and blocks formula injection", () => {
    const csv = invoicesToCsv([emptyInvoice({ vendorName: "=HYPERLINK(1)", total: 5 })], "en", context);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(invoicesToCsv(sample, "ar", context)).toContain('"شركة ""النور"" & أبناؤه"');
  });

  it("produces an accounting import CSV in English", () => {
    const csv = invoicesToAccountingCsv(sample).split("\r\n");
    expect(csv[0]).toContain('"Bill Date","Bill Number","Vendor Name"');
    expect(csv[1]).toContain('"2026-09-09","INV-1"');
    expect(csv[1]).toContain('"15%"');
  });
});
