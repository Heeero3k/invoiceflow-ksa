// Minimal, dependency-light .xlsx writer (Office Open XML + fflate zip).
// Produces a styled workbook that opens cleanly in Excel, Google Sheets,
// Numbers and LibreOffice, and imports into accounting software.
import { strToU8, zipSync } from "fflate";
import { CATEGORY_LABELS, type Invoice } from "../invoice";
import { INVOICE_COLUMNS, groupInvoices, type ExportContext, type GroupRow, type Lang } from "./columns";

type Cell =
  | { kind: "text"; value: string; style?: number }
  | { kind: "number"; value: number; style?: number }
  | { kind: "formula"; formula: string; value: number; style?: number }
  | { kind: "empty"; style?: number };

type Sheet = {
  name: string;
  rows: Cell[][];
  widths: number[];
  rtl: boolean;
  freezeRows?: number;
  autoFilter?: string;
  merges?: string[];
};

// Style indexes into cellXfs below.
const S = {
  default: 0,
  header: 1,
  text: 2,
  money: 3,
  date: 4,
  totalLabel: 5,
  totalMoney: 6,
  title: 7,
  subtitle: 8,
  integer: 9,
  percent: 10,
} as const;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF0F1B2D"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF0F1B2D"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF7A7468"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F1B2D"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3EAD7"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFDDD7CA"/></left><right style="thin"><color rgb="FFDDD7CA"/></right><top style="thin"><color rgb="FFDDD7CA"/></top><bottom style="thin"><color rgb="FFDDD7CA"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Characters that are invalid in XML 1.0.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeXml(value: string) {
  return value
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function columnLetter(index: number) {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Excel serial date (1900 system) for a YYYY-MM-DD string, or null. */
export function excelDateSerial(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(utc)) return null;
  return Math.round(utc / 86_400_000) + 25569;
}

function safeSheetName(name: string, used: Set<string>) {
  let base = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  base = candidate;
  return base;
}

function sheetXml(sheet: Sheet) {
  const lastCol = columnLetter(Math.max(sheet.widths.length - 1, 0));
  const dimension = `A1:${lastCol}${Math.max(sheet.rows.length, 1)}`;
  const pane = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sheet.freezeRows + 1}" sqref="A${sheet.freezeRows + 1}"/>`
    : "";
  const cols = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const r = rowIndex + 1;
      const cells = row
        .map((cell, colIndex) => {
          const ref = `${columnLetter(colIndex)}${r}`;
          const style = cell.style ? ` s="${cell.style}"` : "";
          switch (cell.kind) {
            case "text":
              return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
            case "number":
              return `<c r="${ref}"${style}><v>${Number.isFinite(cell.value) ? cell.value : 0}</v></c>`;
            case "formula":
              return `<c r="${ref}"${style}><f>${escapeXml(cell.formula)}</f><v>${Number.isFinite(cell.value) ? cell.value : 0}</v></c>`;
            default:
              return cell.style ? `<c r="${ref}"${style}/>` : "";
          }
        })
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : "";
  const filter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"${sheet.rtl ? ' rightToLeft="1"' : ""}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${filter}${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

function workbookFiles(sheets: Sheet[], title: string) {
  const files: Record<string, Uint8Array> = {};
  const sheetEntries = sheets.map((sheet, index) => ({ ...sheet, id: index + 1 }));
  files["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetEntries.map((sheet) => `<Override PartName="/xl/worksheets/sheet${sheet.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  files["_rels/.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  files["docProps/core.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>InvoiceFlow KSA</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  files["docProps/app.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>InvoiceFlow KSA</Application></Properties>`);
  const definedNames = sheetEntries
    .map((sheet, index) => {
      if (!sheet.autoFilter) return "";
      const absolute = sheet.autoFilter.replace(/([A-Z]+)(\d+)/g, (_, col: string, row: string) => `$${col}$${row}`);
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">'${escapeXml(sheet.name.replace(/'/g, "''"))}'!${absolute}</definedName>`;
    })
    .join("");
  files["xl/workbook.xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetEntries.map((sheet) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`).join("")}</sheets>${definedNames ? `<definedNames>${definedNames}</definedNames>` : ""}</workbook>`);
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetEntries.map((sheet) => `<Relationship Id="rId${sheet.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.id}.xml"/>`).join("")}<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  files["xl/styles.xml"] = strToU8(STYLES_XML);
  sheetEntries.forEach((sheet) => {
    files[`xl/worksheets/sheet${sheet.id}.xml`] = strToU8(sheetXml(sheet));
  });
  return files;
}

const L = {
  invoices: { ar: "الفواتير", en: "Invoices" },
  byCategory: { ar: "حسب التصنيف", en: "By category" },
  byVendor: { ar: "حسب المورد", en: "By vendor" },
  byProject: { ar: "حسب المشروع", en: "By project" },
  total: { ar: "الإجمالي", en: "Total" },
  count: { ar: "عدد الفواتير", en: "Invoices" },
  share: { ar: "النسبة", en: "Share" },
  category: { ar: "التصنيف", en: "Category" },
  vendor: { ar: "المورد", en: "Vendor" },
  project: { ar: "المشروع", en: "Project" },
  unassigned: { ar: "غير محدد", en: "Unassigned" },
  generated: { ar: "أُنشئ في", en: "Generated" },
};

function summarySheet(name: string, firstHeader: string, groups: GroupRow[], lang: Lang): Sheet {
  const headers = [firstHeader, L.count[lang], INVOICE_COLUMNS[8][lang], INVOICE_COLUMNS[9][lang], INVOICE_COLUMNS[10][lang], L.share[lang]];
  const grandTotal = groups.reduce((sum, row) => sum + row.total, 0);
  const rows: Cell[][] = [headers.map((value) => ({ kind: "text", value, style: S.header }))];
  groups.forEach((group) => {
    rows.push([
      { kind: "text", value: group.name, style: S.text },
      { kind: "number", value: group.count, style: S.integer },
      { kind: "number", value: round(group.subtotal), style: S.money },
      { kind: "number", value: round(group.vat), style: S.money },
      { kind: "number", value: round(group.total), style: S.money },
      { kind: "number", value: grandTotal ? group.total / grandTotal : 0, style: S.percent },
    ]);
  });
  const last = groups.length + 1;
  const sum = (col: string, value: number): Cell => ({ kind: "formula", formula: `SUM(${col}2:${col}${last})`, value: round(value), style: S.totalMoney });
  rows.push([
    { kind: "text", value: L.total[lang], style: S.totalLabel },
    { kind: "formula", formula: `SUM(B2:B${last})`, value: groups.reduce((s, g) => s + g.count, 0), style: S.totalLabel },
    sum("C", groups.reduce((s, g) => s + g.subtotal, 0)),
    sum("D", groups.reduce((s, g) => s + g.vat, 0)),
    sum("E", grandTotal),
    { kind: "empty", style: S.totalLabel },
  ]);
  return { name, rows, widths: [32, 13, 16, 16, 16, 10], rtl: lang === "ar", freezeRows: 1 };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export type WorkbookOptions = {
  title: string;
  lang: Lang;
  context: ExportContext;
  generatedAt?: Date;
};

/** Builds the full workbook: invoice register + summaries by category, vendor and project. */
export function buildInvoiceWorkbook(invoices: Invoice[], options: WorkbookOptions): Uint8Array {
  const { lang, title, context } = options;
  const columns = INVOICE_COLUMNS;
  const headerRow = 4;
  const firstData = headerRow + 1;
  const lastData = headerRow + invoices.length;
  const generated = (options.generatedAt ?? new Date()).toISOString().slice(0, 10);

  const rows: Cell[][] = [
    [{ kind: "text", value: title, style: S.title }],
    [{ kind: "text", value: `InvoiceFlow KSA · ${L.generated[lang]} ${generated} · ${invoices.length} ${L.count[lang]}`, style: S.subtitle }],
    [],
    columns.map((column) => ({ kind: "text", value: column[lang], style: S.header })),
  ];

  invoices.forEach((invoice, index) => {
    rows.push(
      columns.map((column): Cell => {
        const value = column.value(invoice, index, lang, context);
        if (column.kind === "index") return { kind: "number", value: Number(value), style: S.integer };
        if (column.kind === "money") return { kind: "number", value: Number(value) || 0, style: S.money };
        if (column.kind === "date") {
          const serial = excelDateSerial(String(value));
          return serial === null ? { kind: "text", value: String(value), style: S.text } : { kind: "number", value: serial, style: S.date };
        }
        return { kind: "text", value: String(value ?? ""), style: S.text };
      }),
    );
  });

  const totalsRow: Cell[] = columns.map((column, colIndex): Cell => {
    if (colIndex === 0) return { kind: "empty", style: S.totalLabel };
    if (column.key === "vendorName") return { kind: "text", value: L.total[lang], style: S.totalLabel };
    if (column.kind === "money") {
      const letter = columnLetter(colIndex);
      const value = invoices.reduce((sum, invoice) => sum + (Number(column.value(invoice, 0, lang, context)) || 0), 0);
      return invoices.length
        ? { kind: "formula", formula: `SUBTOTAL(9,${letter}${firstData}:${letter}${lastData})`, value: round(value), style: S.totalMoney }
        : { kind: "number", value: 0, style: S.totalMoney };
    }
    return { kind: "empty", style: S.totalLabel };
  });
  rows.push(totalsRow);

  const lastCol = columnLetter(columns.length - 1);
  const register: Sheet = {
    name: L.invoices[lang],
    rows,
    widths: columns.map((column) => column.width),
    rtl: lang === "ar",
    freezeRows: headerRow,
    autoFilter: `A${headerRow}:${lastCol}${Math.max(lastData, headerRow)}`,
    merges: [`A1:${columnLetter(Math.min(columns.length, 8) - 1)}1`, `A2:${columnLetter(Math.min(columns.length, 8) - 1)}2`],
  };

  const used = new Set<string>();
  register.name = safeSheetName(register.name, used);
  const sheets: Sheet[] = [
    register,
    summarySheet(safeSheetName(L.byCategory[lang], used), L.category[lang], groupInvoices(invoices, (invoice) => CATEGORY_LABELS[invoice.category][lang]), lang),
    summarySheet(safeSheetName(L.byVendor[lang], used), L.vendor[lang], groupInvoices(invoices, (invoice) => invoice.vendorName || L.unassigned[lang]), lang),
    summarySheet(safeSheetName(L.byProject[lang], used), L.project[lang], groupInvoices(invoices, (invoice) => invoice.projectName || L.unassigned[lang]), lang),
  ];

  return zipSync(workbookFiles(sheets, title), { level: 6 });
}
