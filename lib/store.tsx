import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { emptyInvoice, isCategoryKey, newId, normalizeDate, round2, type Batch, type Invoice, type InvoiceSource } from "@/shared/invoice";
import { buildLocalInvoiceDraft, compareWithQr, decodeSaudiQrPayload, mergeQr, type ExtractedFields } from "@/shared/invoice-utils";
import { ApiError, errorKey, extractInvoice } from "./api";
import { useAuth } from "./auth";
import { deleteLocalFile, prepareForAi, type UploadMime } from "./files";
import { extractLocalText } from "./local-ocr";
import { usePreferences } from "./preferences";
import type { StringKey } from "./strings";
import { isBackendConfigured } from "./supabase";
import { pullChanges, pushChanges, rowToBatch, rowToInvoice, uploadOriginal } from "./sync";

export type ScanJob = {
  id: string;
  batchId: string;
  uri: string;
  mimeType: UploadMime;
  source: InvoiceSource;
  qr: string | null;
  status: "queued" | "processing" | "failed";
  errorKey: StringKey | null;
  attempts: number;
  retryAt: number;
  createdAt: string;
};

type Data = {
  invoices: Invoice[];
  batches: Batch[];
  jobs: ScanJob[];
  /** "i:<id>" / "b:<id>" -> updatedAt of the version that still needs pushing. */
  dirty: Record<string, string>;
  deletedInvoices: string[];
  deletedBatches: string[];
  lastPulledAt: string | null;
  lastSyncedAt: string | null;
};

const EMPTY: Data = { invoices: [], batches: [], jobs: [], dirty: {}, deletedInvoices: [], deletedBatches: [], lastPulledAt: null, lastSyncedAt: null };

type Action =
  | { type: "load"; data: Data }
  | { type: "upsertInvoices"; invoices: Invoice[] }
  | { type: "removeInvoices"; ids: string[] }
  | { type: "upsertBatch"; batch: Batch }
  | { type: "removeBatch"; id: string }
  | { type: "addJobs"; jobs: ScanJob[] }
  | { type: "patchJob"; id: string; patch: Partial<ScanJob> }
  | { type: "removeJob"; id: string }
  | { type: "synced"; pushed: Record<string, string>; deletedInvoices: string[]; deletedBatches: string[]; at: string }
  | { type: "mergeRemote"; invoices: Invoice[]; removedInvoices: string[]; batches: Batch[]; removedBatches: string[]; lastPulledAt: string | null };

function reducer(state: Data, action: Action): Data {
  switch (action.type) {
    case "load":
      return action.data;
    case "upsertInvoices": {
      const byId = new Map(state.invoices.map((invoice) => [invoice.id, invoice]));
      const dirty = { ...state.dirty };
      for (const invoice of action.invoices) {
        byId.set(invoice.id, invoice);
        dirty[`i:${invoice.id}`] = invoice.updatedAt;
      }
      return { ...state, invoices: sortInvoices([...byId.values()]), dirty };
    }
    case "removeInvoices": {
      const ids = new Set(action.ids);
      const dirty = { ...state.dirty };
      action.ids.forEach((id) => delete dirty[`i:${id}`]);
      return {
        ...state,
        invoices: state.invoices.filter((invoice) => !ids.has(invoice.id)),
        dirty,
        deletedInvoices: [...new Set([...state.deletedInvoices, ...action.ids])],
      };
    }
    case "upsertBatch": {
      const others = state.batches.filter((batch) => batch.id !== action.batch.id);
      return {
        ...state,
        batches: [action.batch, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        dirty: { ...state.dirty, [`b:${action.batch.id}`]: action.batch.updatedAt },
      };
    }
    case "removeBatch": {
      const removed = state.invoices.filter((invoice) => invoice.batchId === action.id).map((invoice) => invoice.id);
      const next = reducer(state, { type: "removeInvoices", ids: removed });
      const dirty = { ...next.dirty };
      delete dirty[`b:${action.id}`];
      return {
        ...next,
        batches: next.batches.filter((batch) => batch.id !== action.id),
        jobs: next.jobs.filter((job) => job.batchId !== action.id),
        dirty,
        deletedBatches: [...new Set([...next.deletedBatches, action.id])],
      };
    }
    case "addJobs":
      return { ...state, jobs: [...state.jobs, ...action.jobs] };
    case "patchJob":
      return { ...state, jobs: state.jobs.map((job) => (job.id === action.id ? { ...job, ...action.patch } : job)) };
    case "removeJob":
      return { ...state, jobs: state.jobs.filter((job) => job.id !== action.id) };
    case "synced": {
      const dirty = { ...state.dirty };
      for (const [key, version] of Object.entries(action.pushed)) if (dirty[key] === version) delete dirty[key];
      return {
        ...state,
        dirty,
        deletedInvoices: state.deletedInvoices.filter((id) => !action.deletedInvoices.includes(id)),
        deletedBatches: state.deletedBatches.filter((id) => !action.deletedBatches.includes(id)),
        lastSyncedAt: action.at,
      };
    }
    case "mergeRemote": {
      const invoices = new Map(state.invoices.map((invoice) => [invoice.id, invoice]));
      for (const id of action.removedInvoices) if (!state.dirty[`i:${id}`]) invoices.delete(id);
      for (const remote of action.invoices) if (!state.dirty[`i:${remote.id}`]) invoices.set(remote.id, remote);
      const batches = new Map(state.batches.map((batch) => [batch.id, batch]));
      for (const id of action.removedBatches) if (!state.dirty[`b:${id}`]) batches.delete(id);
      for (const remote of action.batches) if (!state.dirty[`b:${remote.id}`]) batches.set(remote.id, remote);
      return {
        ...state,
        invoices: sortInvoices([...invoices.values()]),
        batches: [...batches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        lastPulledAt: action.lastPulledAt,
      };
    }
  }
}

function sortInvoices(invoices: Invoice[]) {
  return invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const storageKey = (owner: string) => `invoiceflow.data.v2.${owner}`;

async function loadData(owner: string): Promise<Data> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(owner));
    if (!raw) return EMPTY;
    const parsed = { ...EMPTY, ...(JSON.parse(raw) as Partial<Data>) };
    // Jobs interrupted mid-flight go back to the queue.
    parsed.jobs = parsed.jobs.map((job) => (job.status === "processing" ? { ...job, status: "queued" } : job));
    return parsed;
  } catch {
    return EMPTY;
  }
}

/** Folds guest data into a newly signed-in account; everything becomes dirty so it uploads. */
function mergeGuestInto(user: Data, guest: Data): Data {
  const invoiceIds = new Set(user.invoices.map((invoice) => invoice.id));
  const batchIds = new Set(user.batches.map((batch) => batch.id));
  const dirty = { ...user.dirty };
  guest.invoices.forEach((invoice) => (dirty[`i:${invoice.id}`] = invoice.updatedAt));
  guest.batches.forEach((batch) => (dirty[`b:${batch.id}`] = batch.updatedAt));
  return {
    ...user,
    invoices: sortInvoices([...user.invoices, ...guest.invoices.filter((invoice) => !invoiceIds.has(invoice.id))]),
    batches: [...user.batches, ...guest.batches.filter((batch) => !batchIds.has(batch.id))],
    jobs: [...user.jobs, ...guest.jobs],
    dirty,
  };
}

export type NewCapture = { uri: string; mimeType: UploadMime; source: InvoiceSource; qr?: string | null };

type StoreValue = {
  ready: boolean;
  invoices: Invoice[];
  batches: Batch[];
  jobs: ScanJob[];
  syncing: boolean;
  lastSyncedAt: string | null;
  pendingSync: number;
  createBatch: (name: string) => Batch;
  renameBatch: (id: string, name: string) => void;
  deleteBatch: (id: string) => void;
  addCaptures: (batchId: string, captures: NewCapture[]) => void;
  retryJob: (id: string) => void;
  removeJob: (id: string) => void;
  jobToManual: (id: string) => Invoice | null;
  addManualInvoice: (batchId: string | null) => Invoice;
  updateInvoice: (id: string, patch: Partial<Invoice>) => void;
  approveInvoices: (ids: string[]) => void;
  deleteInvoices: (ids: string[]) => void;
  markExported: (invoiceIds: string[], batchIds: string[]) => void;
  clearLocal: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);
const MAX_PARALLEL_JOBS = 2;

export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { language, keepOriginals } = usePreferences();
  const owner = auth.ready ? (auth.isSignedIn && auth.user ? auth.user.id : "guest") : null;
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [loadedOwner, setLoadedOwner] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(new Set<string>());
  const [tick, setTick] = useState(0);

  // Load data for the current owner (guest or user), migrating guest data on sign-in.
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    (async () => {
      let data = await loadData(owner);
      if (owner !== "guest") {
        const guest = await loadData("guest");
        if (guest.invoices.length || guest.batches.length || guest.jobs.length) {
          data = mergeGuestInto(data, guest);
          await AsyncStorage.setItem(storageKey(owner), JSON.stringify(data));
          await AsyncStorage.removeItem(storageKey("guest"));
        }
      }
      if (cancelled) return;
      inFlight.current.clear();
      dispatch({ type: "load", data });
      setLoadedOwner(owner);
    })();
    return () => {
      cancelled = true;
    };
  }, [owner]);

  // Persist (debounced) after every change.
  useEffect(() => {
    if (!loadedOwner || loadedOwner !== owner) return;
    const timer = setTimeout(() => {
      AsyncStorage.setItem(storageKey(loadedOwner), JSON.stringify(state)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [state, loadedOwner, owner]);

  // ---------------------------------------------------------------- scanning
  const processJob = useCallback(
    async (job: ScanJob) => {
      dispatch({ type: "patchJob", id: job.id, patch: { status: "processing", attempts: job.attempts + 1 } });
      const isImage = job.mimeType !== "application/pdf";
      const localText = isImage ? await extractLocalText(job.uri) : "";
      const localDraft = localText ? buildLocalInvoiceDraft(localText) : null;
      let fields: ExtractedFields | null = null;
      let failure: StringKey | null = null;

      try {
        await auth.ensureSession();
        const prepared = await prepareForAi(job.uri, job.mimeType);
        const result = await extractInvoice(prepared.base64, prepared.mimeType, language);
        fields = {
          ...result,
          category: isCategoryKey(result.category) ? result.category : "other",
          issueDate: normalizeDate(result.issueDate ?? ""),
          subtotal: round2(Number(result.subtotal) || 0),
          vat: round2(Number(result.vat) || 0),
          total: round2(Number(result.total) || 0),
          confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
          warnings: Array.isArray(result.warnings) ? result.warnings.filter((w) => typeof w === "string") : [],
        };
      } catch (error) {
        failure = errorKey(error);
        const offline = error instanceof ApiError && (error.code === "offline" || error.code === "busy");
        if (offline && job.attempts < 20) {
          // Keep it in the queue and try again later.
          dispatch({ type: "patchJob", id: job.id, patch: { status: "queued", errorKey: failure, retryAt: Date.now() + 20_000 } });
          return;
        }
        if (error instanceof ApiError && error.code === "not_invoice") {
          dispatch({ type: "patchJob", id: job.id, patch: { status: "failed", errorKey: failure } });
          return;
        }
        fields = localDraft;
      }

      if (!fields) {
        dispatch({ type: "patchJob", id: job.id, patch: { status: "failed", errorKey: failure ?? "err_ai_failed" } });
        return;
      }

      let qrStatus: Invoice["qrStatus"] = "none";
      const qr = job.qr ? decodeSaudiQrPayload(job.qr) : null;
      if (qr) {
        qrStatus = compareWithQr(fields, qr);
        fields = mergeQr(fields, qr);
      }

      const invoice = emptyInvoice({
        ...fields,
        id: job.id,
        batchId: job.batchId,
        source: job.source,
        localUri: job.uri,
        qrStatus,
        status: "needs-review",
        warnings: failure ? [...fields.warnings, `#${failure}`] : fields.warnings,
      });
      dispatch({ type: "upsertInvoices", invoices: [invoice] });
      dispatch({ type: "removeJob", id: job.id });
    },
    [auth, language],
  );

  useEffect(() => {
    if (!loadedOwner) return;
    const now = Date.now();
    const runnable = state.jobs.filter((job) => job.status === "queued" && job.retryAt <= now && !inFlight.current.has(job.id));
    const slots = MAX_PARALLEL_JOBS - inFlight.current.size;
    runnable.slice(0, Math.max(0, slots)).forEach((job) => {
      inFlight.current.add(job.id);
      processJob(job)
        .catch(() => dispatch({ type: "patchJob", id: job.id, patch: { status: "failed", errorKey: "err_ai_failed" } }))
        .finally(() => {
          inFlight.current.delete(job.id);
          setTick((value) => value + 1);
        });
    });
    // Wake up for delayed retries.
    const waiting = state.jobs.filter((job) => job.status === "queued" && job.retryAt > now);
    if (waiting.length) {
      const timer = setTimeout(() => setTick((value) => value + 1), Math.min(...waiting.map((job) => job.retryAt)) - now + 50);
      return () => clearTimeout(timer);
    }
  }, [state.jobs, loadedOwner, processJob, tick]);

  // ---------------------------------------------------------------- sync
  const syncLock = useRef(false);
  const syncNow = useCallback(async () => {
    const userId = auth.isSignedIn ? auth.user?.id : null;
    if (!isBackendConfigured || !userId || loadedOwner !== userId || syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const snapshot = stateRef.current;
      const pushed: Record<string, string> = {};
      const dirtyBatches = snapshot.batches.filter((batch) => snapshot.dirty[`b:${batch.id}`]);
      const dirtyInvoices: Invoice[] = [];
      for (const invoice of snapshot.invoices) {
        if (!snapshot.dirty[`i:${invoice.id}`]) continue;
        let next = invoice;
        if (keepOriginals && invoice.localUri && !invoice.filePath) {
          const filePath = await uploadOriginal(invoice, userId).catch(() => null);
          if (filePath) {
            next = { ...invoice, filePath };
            // Record the path locally without bumping the version being pushed.
            dispatch({ type: "upsertInvoices", invoices: [next] });
          }
        }
        dirtyInvoices.push(next);
      }
      dirtyBatches.forEach((batch) => (pushed[`b:${batch.id}`] = batch.updatedAt));
      dirtyInvoices.forEach((invoice) => (pushed[`i:${invoice.id}`] = invoice.updatedAt));
      await pushChanges(userId, dirtyBatches, dirtyInvoices, snapshot.deletedInvoices, snapshot.deletedBatches);
      dispatch({ type: "synced", pushed, deletedInvoices: snapshot.deletedInvoices, deletedBatches: snapshot.deletedBatches, at: new Date().toISOString() });

      const { invoiceRows, batchRows, latest } = await pullChanges(stateRef.current.lastPulledAt);
      const localById = new Map(stateRef.current.invoices.map((invoice) => [invoice.id, invoice]));
      dispatch({
        type: "mergeRemote",
        invoices: invoiceRows.filter((row) => !row.deleted).map((row) => rowToInvoice(row, localById.get(row.id))),
        removedInvoices: invoiceRows.filter((row) => row.deleted).map((row) => row.id),
        batches: batchRows.filter((row) => !row.deleted).map(rowToBatch),
        removedBatches: batchRows.filter((row) => row.deleted).map((row) => row.id),
        lastPulledAt: latest,
      });
    } catch (error) {
      console.warn("[sync] failed", error);
    } finally {
      syncLock.current = false;
      setSyncing(false);
    }
  }, [auth.isSignedIn, auth.user?.id, keepOriginals, loadedOwner]);

  const dirtyCount = Object.keys(state.dirty).length + state.deletedInvoices.length + state.deletedBatches.length;

  // Sync shortly after local changes, on sign-in and when the app returns to the foreground.
  useEffect(() => {
    if (!auth.isSignedIn || !loadedOwner || loadedOwner === "guest") return;
    const timer = setTimeout(() => void syncNow(), dirtyCount ? 3000 : 300);
    return () => clearTimeout(timer);
  }, [auth.isSignedIn, dirtyCount, loadedOwner, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void syncNow();
    });
    return () => subscription.remove();
  }, [syncNow]);

  // ---------------------------------------------------------------- actions
  const createBatch = useCallback((name: string) => {
    const now = new Date().toISOString();
    const batch: Batch = { id: newId(), name, exportedAt: null, createdAt: now, updatedAt: now };
    dispatch({ type: "upsertBatch", batch });
    return batch;
  }, []);

  const renameBatch = useCallback((id: string, name: string) => {
    const batch = stateRef.current.batches.find((item) => item.id === id);
    if (batch) dispatch({ type: "upsertBatch", batch: { ...batch, name, updatedAt: new Date().toISOString() } });
  }, []);

  const deleteBatch = useCallback((id: string) => {
    const snapshot = stateRef.current;
    snapshot.invoices.filter((invoice) => invoice.batchId === id).forEach((invoice) => void deleteLocalFile(invoice.localUri));
    snapshot.jobs.filter((job) => job.batchId === id).forEach((job) => void deleteLocalFile(job.uri));
    dispatch({ type: "removeBatch", id });
  }, []);

  const addCaptures = useCallback((batchId: string, captures: NewCapture[]) => {
    const now = new Date().toISOString();
    const jobs: ScanJob[] = captures.map((capture) => ({
      id: capture.uri.match(/([0-9a-f-]{36})\.\w+$/)?.[1] ?? newId(),
      batchId,
      uri: capture.uri,
      mimeType: capture.mimeType,
      source: capture.source,
      qr: capture.qr ?? null,
      status: "queued",
      errorKey: null,
      attempts: 0,
      retryAt: 0,
      createdAt: now,
    }));
    dispatch({ type: "addJobs", jobs });
  }, []);

  const retryJob = useCallback((id: string) => dispatch({ type: "patchJob", id, patch: { status: "queued", errorKey: null, retryAt: 0, attempts: 0 } }), []);

  const removeJob = useCallback((id: string) => {
    const job = stateRef.current.jobs.find((item) => item.id === id);
    if (job) void deleteLocalFile(job.uri);
    dispatch({ type: "removeJob", id });
  }, []);

  const jobToManual = useCallback((id: string) => {
    const job = stateRef.current.jobs.find((item) => item.id === id);
    if (!job) return null;
    const invoice = emptyInvoice({ id: job.id, batchId: job.batchId, source: job.source, localUri: job.uri });
    dispatch({ type: "upsertInvoices", invoices: [invoice] });
    dispatch({ type: "removeJob", id });
    return invoice;
  }, []);

  const addManualInvoice = useCallback((batchId: string | null) => {
    const invoice = emptyInvoice({ batchId, source: "manual", confidence: 1 });
    dispatch({ type: "upsertInvoices", invoices: [invoice] });
    return invoice;
  }, []);

  const updateInvoice = useCallback((id: string, patch: Partial<Invoice>) => {
    const invoice = stateRef.current.invoices.find((item) => item.id === id);
    if (invoice) dispatch({ type: "upsertInvoices", invoices: [{ ...invoice, ...patch, updatedAt: new Date().toISOString() }] });
  }, []);

  const approveInvoices = useCallback((ids: string[]) => {
    const now = new Date().toISOString();
    const set = new Set(ids);
    const changed = stateRef.current.invoices.filter((invoice) => set.has(invoice.id)).map((invoice) => ({ ...invoice, status: "approved" as const, updatedAt: now }));
    if (changed.length) dispatch({ type: "upsertInvoices", invoices: changed });
  }, []);

  const deleteInvoices = useCallback((ids: string[]) => {
    const set = new Set(ids);
    stateRef.current.invoices.filter((invoice) => set.has(invoice.id)).forEach((invoice) => void deleteLocalFile(invoice.localUri));
    dispatch({ type: "removeInvoices", ids });
  }, []);

  const markExported = useCallback((invoiceIds: string[], batchIds: string[]) => {
    const now = new Date().toISOString();
    const set = new Set(invoiceIds);
    const changed = stateRef.current.invoices.filter((invoice) => set.has(invoice.id)).map((invoice) => ({ ...invoice, exportedAt: now, updatedAt: now }));
    if (changed.length) dispatch({ type: "upsertInvoices", invoices: changed });
    stateRef.current.batches
      .filter((batch) => batchIds.includes(batch.id))
      .forEach((batch) => dispatch({ type: "upsertBatch", batch: { ...batch, exportedAt: now, updatedAt: now } }));
  }, []);

  const clearLocal = useCallback(async () => {
    const snapshot = stateRef.current;
    snapshot.invoices.forEach((invoice) => void deleteLocalFile(invoice.localUri));
    snapshot.jobs.forEach((job) => void deleteLocalFile(job.uri));
    dispatch({ type: "load", data: EMPTY });
    if (owner) await AsyncStorage.removeItem(storageKey(owner));
  }, [owner]);

  const value = useMemo<StoreValue>(
    () => ({
      ready: Boolean(loadedOwner && loadedOwner === owner),
      invoices: state.invoices,
      batches: state.batches,
      jobs: state.jobs,
      syncing,
      lastSyncedAt: state.lastSyncedAt,
      pendingSync: dirtyCount,
      createBatch,
      renameBatch,
      deleteBatch,
      addCaptures,
      retryJob,
      removeJob,
      jobToManual,
      addManualInvoice,
      updateInvoice,
      approveInvoices,
      deleteInvoices,
      markExported,
      clearLocal,
      syncNow,
    }),
    [addCaptures, addManualInvoice, approveInvoices, clearLocal, createBatch, deleteBatch, deleteInvoices, dirtyCount, jobToManual, loadedOwner, markExported, owner, removeJob, renameBatch, retryJob, state, syncNow, syncing, updateInvoice],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used inside StoreProvider");
  return context;
}
