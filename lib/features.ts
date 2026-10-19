// Feature switches read at build time.

/**
 * Smart reading with Claude (paid per invoice). Off by default: invoices are
 * read for free on the device (Saudi e-invoice QR + on-device OCR) and the user
 * completes the rest on the review screen. Set EXPO_PUBLIC_AI_EXTRACTION=on and
 * ANTHROPIC_API_KEY on the server to enable it.
 */
export const AI_EXTRACTION = process.env.EXPO_PUBLIC_AI_EXTRACTION === "on";
