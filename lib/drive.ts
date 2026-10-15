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

/** Sends raw bytes (uploadType=media), then names and files the new Drive item. */
async function uploadMedia(access: DriveAccess, source: { uri?: string; bytes?: Uint8Array }, mimeType: string): Promise<string> {
  const url = `${UPLOAD}?uploadType=media&fields=id`;
  if (Platform.OS !== "web") {
    let uri = source.uri;
    if (!uri) {
      // Generated files (Excel/CSV) are written to cache first so the native uploader can stream them.
      uri = `${FileSystem.cacheDirectory}drive-upload-${Date.now()}`;
      await FileSystem.writeAsStringAsync(uri, bytesToBase64(source.bytes!), { encoding: FileSystem.EncodingType.Base64 });
    }
    const result = await FileSystem.uploadAsync(url, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": mimeType },
    });
    if (result.status >= 300) throw new Error(`Google Drive upload failed (${result.status})`);
    return (JSON.parse(result.body) as { id: string }).id;
  }
  const bytes = source.bytes ?? (await readFileBytes(source.uri!));
  const response = await fetch(url, {
    method: "POST",
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
