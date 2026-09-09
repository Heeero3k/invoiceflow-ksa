import { Platform } from "react-native";
import { buildLocalInvoiceDraft } from "@/shared/invoice-utils";

export type LocalOcrResult = {
  text: string;
  lines: string[];
  supported: boolean;
  source: "on-device" | "unavailable";
};

export { buildLocalInvoiceDraft };

export async function extractLocalInvoiceText(uri: string): Promise<LocalOcrResult> {
  if (Platform.OS === "web") return { text: "", lines: [], supported: false, source: "unavailable" };
  try {
    const extractor = await import("expo-text-extractor");
    if (!extractor.isSupported) return { text: "", lines: [], supported: false, source: "unavailable" };
    const lines = await extractor.extractTextFromImage(uri);
    return { text: lines.join("\n"), lines, supported: true, source: "on-device" };
  } catch {
    return { text: "", lines: [], supported: false, source: "unavailable" };
  }
}
