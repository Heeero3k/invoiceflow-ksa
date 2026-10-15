import { Platform } from "react-native";

/** On-device text recognition (ML Kit / Vision). Returns "" where unsupported. */
export async function extractLocalText(uri: string): Promise<string> {
  if (Platform.OS === "web") return "";
  try {
    const extractor = await import("expo-text-extractor");
    if (!extractor.isSupported) return "";
    const lines = await extractor.extractTextFromImage(uri);
    return lines.join("\n");
  } catch {
    return "";
  }
}
