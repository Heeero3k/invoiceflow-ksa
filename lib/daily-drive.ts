// Keeps one Excel file per project per scan day up to date in the user's Google Drive:
//   InvoiceFlow KSA / <project> / <project> - <day>.xlsx
// Re-scanning or editing an invoice rewrites that day's file in place, so the link
// the supervisor shared with the accountant always opens the latest version.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { dailyFileName, dailyTitle, groupDaily, groupSignature, type DailyGroup } from "@/shared/export/daily";
import { buildInvoiceWorkbook } from "@/shared/export/xlsx";
import { ApiError, type DriveAccess } from "./api";
import { useAuth } from "./auth";
import { findDriveItem, findOrCreateDriveFolder, getDriveAccess, updateDriveFile, uploadToDrive } from "./drive";
import { safeFileName } from "./files";
import { usePreferences, type Language } from "./preferences";
import { useStore } from "./store";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const RECENT_DAYS = 7;
const DEBOUNCE_MS = 15_000;

type SyncedFile = { sig: string; fileId: string };
type SyncState = Record<string, SyncedFile>;

const storageKey = (userId: string) => `invoiceflow.dailyDrive.v1.${userId}`;

async function loadState(userId: string): Promise<SyncState> {
  try {
    return JSON.parse((await AsyncStorage.getItem(storageKey(userId))) ?? "{}") as SyncState;
  } catch {
    return {};
  }
}

function recentGroups(groups: DailyGroup[]) {
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  return groups.filter((group) => group.day >= cutoff);
}

async function writeGroup(access: DriveAccess, group: DailyGroup, lang: Language, batchNames: Record<string, string>, known?: SyncedFile) {
  const invoices = [...group.invoices].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const bytes = buildInvoiceWorkbook(invoices, { title: dailyTitle(group, lang), lang, context: { batchNames } });
  if (known) {
    try {
      await updateDriveFile(access, known.fileId, { mimeType: XLSX_MIME, bytes });
      return known.fileId;
    } catch {
      // Deleted or moved in Drive: fall through and find or recreate it.
    }
  }
  const folder = await findOrCreateDriveFolder(access, safeFileName(group.project));
  const name = safeFileName(dailyFileName(group).replace(/\.xlsx$/, "")) + ".xlsx";
  const existing = await findDriveItem(access, name, folder.id);
  if (existing) {
    await updateDriveFile(access, existing.id, { mimeType: XLSX_MIME, bytes });
    return existing.id;
  }
  return (await uploadToDrive(access, { name, mimeType: XLSX_MIME, parentId: folder.id, bytes })).id;
}

/** Mounted once at the app root. Does nothing for guests or until Google Drive is connected. */
export function useDailyDriveSync() {
  const auth = useAuth();
  const store = useStore();
  const prefs = usePreferences();
  const userId = auth.isSignedIn && auth.user ? auth.user.id : null;
  const enabled = Boolean(userId && prefs.dailyDriveFile && store.ready);
  const busy = store.jobs.some((job) => job.status === "queued" || job.status === "processing");
  const running = useRef(false);
  const notConnected = useRef(false);

  useEffect(() => {
    if (!enabled || busy || notConnected.current || !userId) return;
    const lang = prefs.exportLanguage;
    const groups = recentGroups(groupDaily(store.invoices, lang));
    if (!groups.length) return;
    const batchNames = Object.fromEntries(store.batches.map((batch) => [batch.id, batch.name]));

    const timer = setTimeout(async () => {
      if (running.current) return;
      running.current = true;
      try {
        const state = await loadState(userId);
        const changed = groups.filter((group) => state[`${lang}:${group.key}`]?.sig !== groupSignature(group));
        if (!changed.length) return;
        const access = await getDriveAccess();
        for (const group of changed) {
          const key = `${lang}:${group.key}`;
          state[key] = { sig: groupSignature(group), fileId: await writeGroup(access, group, lang, batchNames, state[key]) };
          await AsyncStorage.setItem(storageKey(userId), JSON.stringify(state));
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "sheets_not_connected") notConnected.current = true;
        else console.warn("[daily-drive] sync failed", error);
      } finally {
        running.current = false;
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, busy, userId, prefs.exportLanguage, store.invoices, store.batches]);
}
