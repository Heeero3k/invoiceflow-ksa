import * as FileSystem from "expo-file-system/legacy";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

export type UploadMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const INVOICE_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}invoices/` : null;

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunk, bytes.length)));
  }
  return globalThis.btoa(binary);
}

export function base64ToBytes(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function readBase64(uri: string) {
  if (uri.startsWith("data:")) return uri.slice(uri.indexOf(",") + 1);
  if (Platform.OS !== "web") return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const response = await fetch(uri);
  return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
}

/**
 * Copies a capture into the app's documents folder so it survives cache
 * cleanup and app restarts while it waits in the scan queue.
 */
export async function persistCapture(uri: string, id: string, extension: string) {
  if (Platform.OS === "web" || !INVOICE_DIR) return uri;
  await FileSystem.makeDirectoryAsync(INVOICE_DIR, { intermediates: true }).catch(() => undefined);
  const target = `${INVOICE_DIR}${id}.${extension}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}

export async function deleteLocalFile(uri: string | null) {
  if (!uri || Platform.OS === "web" || !INVOICE_DIR || !uri.startsWith(INVOICE_DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/**
 * Returns base64 ready for the AI: photos are downscaled to ~1800px JPEG
 * (sharp enough for small print, ~10x smaller than camera originals).
 */
export async function prepareForAi(uri: string, mimeType: UploadMime): Promise<{ base64: string; mimeType: UploadMime }> {
  if (mimeType === "application/pdf") return { base64: await readBase64(uri), mimeType };
  try {
    const result = await manipulateAsync(uri, [{ resize: { width: 1800 } }], { compress: 0.72, format: SaveFormat.JPEG, base64: true });
    if (result.base64) return { base64: result.base64, mimeType: "image/jpeg" };
  } catch {
    // Fall through to the original file (e.g. unsupported format on web).
  }
  return { base64: await readBase64(uri), mimeType };
}

export async function readFileBytes(uri: string) {
  return base64ToBytes(await readBase64(uri));
}

/** Writes a generated file and opens the system share sheet (or downloads on web). */
export async function shareGeneratedFile(fileName: string, mimeType: string, data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(`﻿${data}`) : data;
  if (Platform.OS === "web") {
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName, UTI: mimeType.includes("sheet") ? "org.openxmlformats.spreadsheetml.sheet" : "public.comma-separated-values-text" });
  }
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "InvoiceFlow";
}
