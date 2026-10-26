// Uploads straight from the device to the user's own Google Drive, using a
// short-lived token scoped to files this app creates (drive.file).
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { sheets, type DriveAccess } from "./api";
import { bytesToBase64, readFileBytes } from "./files";

const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export type DriveFile = { id: string; webViewLink: string };

async function driveJson<T>(access: DriveAccess, url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Google Drive error ${response.status}`);
  return body as T;
}

export function getDriveAccess() {
  return sheets.driveAccess();
}

export function createDriveFolder(access: DriveAccess, name: string, parentId = access.folderId) {
  return driveJson<DriveFile>(access, `${DRIVE}/files?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
}

/** Sends raw bytes (uploadType=media) as a new Drive item, or as new content for `fileId`. */
async function uploadMedia(access: DriveAccess, source: { uri?: string; bytes?: Uint8Array }, mimeType: string, fileId?: string): Promise<string> {
  const url = `${UPLOAD}${fileId ? `/${fileId}` : ""}?uploadType=media&fields=id`;
  const method = fileId ? "PATCH" : "POST";
  if (Platform.OS !== "web") {
    let uri = source.uri;
    if (!uri) {
      // Generated files (Excel/CSV) are written to cache first so the native uploader can stream them.
      uri = `${FileSystem.cacheDirectory}drive-upload-${Date.now()}`;
      await FileSystem.writeAsStringAsync(uri, bytesToBase64(source.bytes!), { encoding: FileSystem.EncodingType.Base64 });
    }
    const result = await FileSystem.uploadAsync(url, uri, {
      httpMethod: method,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": mimeType },
    });
    if (result.status >= 300) throw new Error(`Google Drive upload failed (${result.status})`);
    return (JSON.parse(result.body) as { id: string }).id;
  }
  const bytes = source.bytes ?? (await readFileBytes(source.uri!));
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": mimeType },
    body: new Blob([bytes as BlobPart], { type: mimeType }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message ?? `Google Drive upload failed (${response.status})`);
  return (body as { id: string }).id;
}

export async function uploadToDrive(
  access: DriveAccess,
  file: { name: string; mimeType: string; parentId: string; uri?: string; bytes?: Uint8Array },
): Promise<DriveFile> {
  const id = await uploadMedia(access, file, file.mimeType);
  // The media upload lands in "My Drive" root; move it into the target folder and name it.
  return driveJson<DriveFile>(access, `${DRIVE}/files/${id}?addParents=${encodeURIComponent(file.parentId)}&removeParents=root&fields=id,webViewLink`, {
    method: "PATCH",
    body: JSON.stringify({ name: file.name }),
  });
}

/** Drive search literal: names may contain quotes or backslashes. */
const quote = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** First non-trashed item with this exact name inside `parentId` (only files this app created are visible). */
export async function findDriveItem(access: DriveAccess, name: string, parentId: string, folder = false): Promise<DriveFile | null> {
  const q = [`name = ${quote(name)}`, `${quote(parentId)} in parents`, "trashed = false", `mimeType ${folder ? "=" : "!="} 'application/vnd.google-apps.folder'`].join(" and ");
  const result = await driveJson<{ files: DriveFile[] }>(access, `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,webViewLink)&pageSize=1`, { method: "GET" });
  return result.files[0] ?? null;
}

export async function findOrCreateDriveFolder(access: DriveAccess, name: string, parentId = access.folderId) {
  return (await findDriveItem(access, name, parentId, true)) ?? createDriveFolder(access, name, parentId);
}

/** Replaces the content of an existing Drive file, keeping its name, link and sharing. */
export async function updateDriveFile(access: DriveAccess, fileId: string, file: { mimeType: string; bytes: Uint8Array }) {
  await uploadMedia(access, file, file.mimeType, fileId);
}
