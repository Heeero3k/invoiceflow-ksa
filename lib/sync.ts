import { isCategoryKey, type Batch, type Invoice } from "@/shared/invoice";
import { readFileBytes } from "./files";
import { supabase } from "./supabase";

type InvoiceRow = {
  id: string;
  user_id: string;
  batch_id: string | null;
  vendor_name: string;
  vendor_tax_id: string;
  customer_name: string;
  customer_tax_id: string;
  invoice_number: string;
  issue_date: string;
  project_name: string;
  category: string;
  subtotal: number | string;
  vat: number | string;
  total: number | string;
  currency: string;
  notes: string;
  status: Invoice["status"];
  confidence: number;
  source: Invoice["source"];
  qr_status: string;
  file_path: string | null;
  exported_at: string | null;
  created_at: string;
  updated_at: string;
  deleted: boolean;
};

type BatchRow = { id: string; user_id: string; name: string; exported_at: string | null; created_at: string; updated_at: string; deleted: boolean };

export function invoiceToRow(invoice: Invoice, userId: string): Omit<InvoiceRow, "updated_at"> {
  return {
    id: invoice.id,
    user_id: userId,
    batch_id: invoice.batchId,
    vendor_name: invoice.vendorName,
    vendor_tax_id: invoice.vendorTaxId,
    customer_name: invoice.customerName,
    customer_tax_id: invoice.customerTaxId,
    invoice_number: invoice.invoiceNumber,
    issue_date: invoice.issueDate,
    project_name: invoice.projectName,
    category: invoice.category,
    subtotal: invoice.subtotal,
    vat: invoice.vat,
    total: invoice.total,
    currency: invoice.currency,
    notes: invoice.notes,
    status: invoice.status,
    confidence: invoice.confidence,
    source: invoice.source,
    qr_status: invoice.qrStatus,
    file_path: invoice.filePath,
    exported_at: invoice.exportedAt,
    created_at: invoice.createdAt,
    deleted: false,
  };
}

export function rowToInvoice(row: InvoiceRow, local?: Invoice): Invoice {
  return {
    id: row.id,
    batchId: row.batch_id,
    vendorName: row.vendor_name,
    vendorTaxId: row.vendor_tax_id,
    customerName: row.customer_name,
    customerTaxId: row.customer_tax_id,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    projectName: row.project_name,
    category: isCategoryKey(row.category) ? row.category : "other",
    subtotal: Number(row.subtotal) || 0,
    vat: Number(row.vat) || 0,
    total: Number(row.total) || 0,
    currency: row.currency,
    notes: row.notes,
    status: row.status,
    confidence: row.confidence,
    source: row.source,
    qrStatus: row.qr_status === "valid" || row.qr_status === "mismatch" ? row.qr_status : "none",
    warnings: local?.warnings ?? [],
    localUri: local?.localUri ?? null,
    filePath: row.file_path,
    exportedAt: row.exported_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function batchToRow(batch: Batch, userId: string): Omit<BatchRow, "updated_at"> {
  return { id: batch.id, user_id: userId, name: batch.name, exported_at: batch.exportedAt, created_at: batch.createdAt, deleted: false };
}

export function rowToBatch(row: BatchRow): Batch {
  return { id: row.id, name: row.name, exportedAt: row.exported_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function uploadOriginal(invoice: Invoice, userId: string) {
  if (!invoice.localUri) return null;
  const isPdf = invoice.source === "pdf";
  const path = `${userId}/${invoice.id}.${isPdf ? "pdf" : "jpg"}`;
  const bytes = await readFileBytes(invoice.localUri);
  const { error } = await supabase.storage
    .from("invoice-files")
    .upload(path, bytes, { contentType: isPdf ? "application/pdf" : "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export async function pushChanges(userId: string, batches: Batch[], invoices: Invoice[], deletedInvoiceIds: string[], deletedBatchIds: string[]) {
  if (batches.length) {
    const { error } = await supabase.from("batches").upsert(batches.map((batch) => batchToRow(batch, userId)));
    if (error) throw error;
  }
  if (invoices.length) {
    const { error } = await supabase.from("invoices").upsert(invoices.map((invoice) => invoiceToRow(invoice, userId)));
    if (error) throw error;
  }
  if (deletedInvoiceIds.length) {
    const { error } = await supabase.from("invoices").update({ deleted: true }).in("id", deletedInvoiceIds);
    if (error) throw error;
    await supabase.storage
      .from("invoice-files")
      .remove(deletedInvoiceIds.flatMap((id) => [`${userId}/${id}.jpg`, `${userId}/${id}.pdf`]))
      .catch(() => undefined);
  }
  if (deletedBatchIds.length) {
    const { error } = await supabase.from("batches").update({ deleted: true }).in("id", deletedBatchIds);
    if (error) throw error;
  }
}

export async function pullChanges(since: string | null) {
  const pageSize = 1000;
  const fetchAll = async <T extends { updated_at: string }>(table: "invoices" | "batches") => {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
      let query = supabase.from(table).select("*").order("updated_at", { ascending: true }).range(from, from + pageSize - 1);
      if (since) query = query.gt("updated_at", since);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < pageSize) return rows;
    }
  };
  const [invoiceRows, batchRows] = await Promise.all([fetchAll<InvoiceRow>("invoices"), fetchAll<BatchRow>("batches")]);
  const latest = [...invoiceRows, ...batchRows].reduce<string | null>((max, row) => (!max || row.updated_at > max ? row.updated_at : max), since);
  return { invoiceRows, batchRows, latest };
}

export type { BatchRow, InvoiceRow };
