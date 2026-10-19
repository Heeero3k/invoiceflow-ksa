import { scanFromURLAsync } from "expo-camera";

/** Finds a QR code (e.g. the ZATCA e-invoice QR) in a saved photo. Free and on-device. */
export async function scanQrFromImage(uri: string): Promise<string | null> {
  try {
    const results = await scanFromURLAsync(uri, ["qr"]);
    return results.find((result) => result.data)?.data ?? null;
  } catch {
    return null;
  }
}
