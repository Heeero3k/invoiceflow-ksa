// Reads one invoice (photo or PDF) with Claude and returns structured fields.
// The app always shows the result on a review screen before anything is saved.
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { AppError, corsHeaders, errorResponse, json, requireEnv } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const CATEGORY_KEYS = [
  "materials",
  "equipment",
  "subcontract",
  "services",
  "transport",
  "fuel",
  "utilities",
  "rent",
  "maintenance",
  "office",
  "hospitality",
  "government",
  "other",
] as const;

const MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
type MimeType = (typeof MIME_TYPES)[number];

// ~12 MB of base64 ≈ 9 MB file. Photos are downscaled on the device first.
const MAX_BASE64_LENGTH = 12_000_000;

const INVOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isInvoice",
    "vendorName",
    "vendorTaxId",
    "customerName",
    "customerTaxId",
    "invoiceNumber",
    "issueDate",
    "projectName",
    "category",
    "subtotal",
    "vat",
    "total",
    "currency",
    "confidence",
    "warnings",
  ],
  properties: {
    isInvoice: { type: "boolean", description: "False when the document is not an invoice, receipt or credit note." },
    vendorName: { type: "string", description: "Seller / supplier legal name exactly as printed." },
    vendorTaxId: { type: "string", description: "Seller VAT number (15 digits in KSA, starts and ends with 3). Digits only, empty if absent." },
    customerName: { type: "string", description: "Buyer name if printed, else empty." },
    customerTaxId: { type: "string", description: "Buyer VAT number if printed, digits only, else empty." },
    invoiceNumber: { type: "string", description: "Invoice / receipt number as printed." },
    issueDate: { type: "string", description: "Issue date as YYYY-MM-DD (Gregorian). Convert Hijri dates. Empty if unreadable." },
    projectName: { type: "string", description: "Project, site or PO reference if printed, else empty." },
    category: { type: "string", enum: [...CATEGORY_KEYS], description: "Best expense category for an accountant." },
    subtotal: { type: "number", description: "Total before VAT. 0 if not printed." },
    vat: { type: "number", description: "VAT amount. 0 if not printed." },
    total: { type: "number", description: "Grand total including VAT." },
    currency: { type: "string", description: "ISO 4217 code, usually SAR." },
    confidence: { type: "number", description: "0..1 overall confidence that every non-empty field is correct." },
    warnings: { type: "array", items: { type: "string" }, description: "Short notes on unclear or inconsistent values." },
  },
} as const;

const SYSTEM_PROMPT = `You are a meticulous Saudi accountant reading supplier invoices, receipts and credit notes for data entry.

Rules:
- Copy values exactly as printed; never invent data. Leave text fields empty and amounts 0 when a value is not visible.
- Invoices are often bilingual (Arabic/English). Prefer the seller's legal name; keep it in the script it is printed in.
- Saudi VAT numbers have 15 digits. Normalize Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) to Western digits in every field.
- Amounts: read the summary block (Subtotal / Total excl. VAT, VAT 15%, Total incl. VAT). Use plain numbers without separators.
- If subtotal + vat does not equal total, keep the printed numbers and add a warning.
- Dates: output YYYY-MM-DD. Convert Hijri (هـ) dates to Gregorian.
- Choose the category from the allowed list based on what was purchased.
- Lower the confidence for blurry, cropped, handwritten or partially visible documents.`;

const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let chargedUser: string | null = null;
  try {
    if (req.method !== "POST") throw new AppError("method_not_allowed", "Use POST", 405);
    const user = await requireUser(req);
    const body = (await req.json()) as { file?: string; mimeType?: string; language?: string };

    const mimeType = body.mimeType as MimeType;
    if (!MIME_TYPES.includes(mimeType)) throw new AppError("unsupported_file", "Unsupported file type");
    const file = (body.file ?? "").replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    if (!file) throw new AppError("empty_file", "No file provided");
    if (file.length > MAX_BASE64_LENGTH) throw new AppError("file_too_large", "File is too large", 413);
    const language = body.language === "en" ? "English" : "Arabic";

    await consumeQuota(user.id, Boolean(user.is_anonymous));
    chargedUser = user.id;

    const model = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5-5";
    const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

    const documentBlock: Anthropic.Beta.BetaContentBlockParam =
      mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file } }
        : { type: "image", source: { type: "base64", media_type: mimeType, data: file } };

    const response = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: INVOICE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            documentBlock,
            { type: "text", text: `Extract the invoice fields. Write any warnings in ${language}.` },
          ],
        },
      ],
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });

    if (response.stop_reason === "refusal") throw new AppError("refused", "The document could not be processed", 422);
    if (response.stop_reason === "max_tokens") throw new AppError("ai_failed", "The result was cut off", 502);
    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") throw new AppError("ai_failed", "Empty AI response", 502);

    const result = JSON.parse(text.text) as Record<string, unknown>;
    if (result.isInvoice === false) throw new AppError("not_invoice", "This does not look like an invoice", 422);
    return json({ ...result, model: response.model });
  } catch (error) {
    if (chargedUser && (error instanceof Anthropic.APIError || (error instanceof AppError && error.code === "ai_failed"))) {
      await adminClient().rpc("refund_scan", { p_user: chargedUser });
    }
    if (error instanceof Anthropic.RateLimitError) return errorResponse(new AppError("busy", "AI service is busy", 429));
    if (error instanceof Anthropic.APIError) {
      return errorResponse(new AppError("ai_failed", `AI service error ${error.status ?? ""}`.trim(), 502));
    }
    return errorResponse(error);
  }
});

/** Guests (anonymous sessions) get a smaller allowance so throwaway sessions can't run up AI costs. */
async function consumeQuota(userId: string, anonymous: boolean) {
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const limit = profile?.plan === "pro"
    ? Number(Deno.env.get("PRO_MONTHLY_SCANS") ?? 2000)
    : anonymous
      ? Number(Deno.env.get("GUEST_MONTHLY_SCANS") ?? 10)
      : Number(Deno.env.get("FREE_MONTHLY_SCANS") ?? 40);
  const { data, error } = await admin.rpc("consume_scan", { p_user: userId, p_limit: limit });
  if (error) throw error;
  if (data === -1) throw new AppError("quota_exceeded", `Monthly limit of ${limit} scans reached`, 429);
}
