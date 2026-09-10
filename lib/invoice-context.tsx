import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export type InvoiceStatus = "reviewed" | "needs-review";
export type InvoiceSource = "camera" | "gallery" | "pdf";

export type Invoice = {
  id: string;
  vendorName: string;
  customerName: string;
  vendorTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  projectName: string;
  subtotal: number;
  vat: number;
  total: number;
  currency: string;
  confidence: number;
  status: InvoiceStatus;
  source: InvoiceSource;
  category: string;
  qrStatus?: string;
  sourceUri?: string;
  createdAt: string;
};

export type InvoiceDraft = Omit<Invoice, "id" | "createdAt" | "status"> & { status?: InvoiceStatus };

type InvoiceContextValue = {
  invoices: Invoice[];
  loading: boolean;
  addInvoice: (draft: InvoiceDraft) => Promise<Invoice>;
  updateInvoice: (id: string, patch: Partial<Invoice>) => Promise<void>;
  removeInvoice: (id: string) => Promise<void>;
  clearInvoices: () => Promise<void>;
};

const InvoiceContext = createContext<InvoiceContextValue | null>(null);

export function InvoiceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const storageKey = `invoiceflow-ksa.invoices.${user?.id ?? "guest"}.v1`;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        setInvoices(raw ? (JSON.parse(raw) as Invoice[]) : []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [storageKey]);

  const persist = useCallback(async (next: Invoice[]) => {
    setInvoices(next);
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  const addInvoice = useCallback(async (draft: InvoiceDraft) => {
    const invoice: Invoice = {
      ...draft,
      id: `INV-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: draft.status ?? (draft.confidence >= 0.82 ? "reviewed" : "needs-review"),
    };
    await persist([invoice, ...invoices]);
    return invoice;
  }, [invoices, persist]);

  const updateInvoice = useCallback(async (id: string, patch: Partial<Invoice>) => {
    await persist(invoices.map((invoice) => (invoice.id === id ? { ...invoice, ...patch } : invoice)));
  }, [invoices, persist]);

  const removeInvoice = useCallback(async (id: string) => {
    await persist(invoices.filter((invoice) => invoice.id !== id));
  }, [invoices, persist]);

  const clearInvoices = useCallback(async () => {
    await persist([]);
  }, [persist]);

  const value = useMemo(() => ({ invoices, loading, addInvoice, updateInvoice, removeInvoice, clearInvoices }), [
    invoices,
    loading,
    addInvoice,
    updateInvoice,
    removeInvoice,
    clearInvoices,
  ]);

  return <InvoiceContext.Provider value={value}>{children}</InvoiceContext.Provider>;
}

export function useInvoices() {
  const context = useContext(InvoiceContext);
  if (!context) throw new Error("useInvoices must be used inside InvoiceProvider");
  return context;
}

export function formatSar(value: number) {
  return `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(value || 0)} ر.س`;
}

export function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-SA", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
