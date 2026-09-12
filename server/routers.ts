import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { PDFParse } from "pdf-parse";

const invoiceFieldsSchema = z.object({
  vendorName: z.string().default(""),
  customerName: z.string().default(""),
  vendorTaxId: z.string().default(""),
  invoiceNumber: z.string().default(""),
  issueDate: z.string().default(""),
  projectName: z.string().default(""),
  subtotal: z.number().default(0),
  vat: z.number().default(0),
  total: z.number().default(0),
  currency: z.string().default("SAR"),
  confidence: z.number().min(0).max(1).default(0.45),
  warnings: z.array(z.string()).default([]),
  category: z.string().default("مشتريات / فاتورة ضريبية"),
});

function fallbackFromText(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const numbers = text.match(/\d+[,.]?\d*/g)?.map((value) => Number(value.replace(/,/g, ""))) ?? [];
  const taxId = text.match(/\b\d{15}\b/)?.[0] ?? "";
  const invoiceNumber = text.match(/(?:invoice|فاتورة|رقم)\s*[:#-]?\s*([A-Za-z0-9-]+)/i)?.[1] ?? "";
  const issueDate = text.match(/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b/)?.[0] ?? "";
  const amounts = numbers.filter((number) => String(Math.trunc(number)).length < 15);
  const total = Math.max(...amounts, 0);
  const vat = amounts.find((number) => number > 0 && number < total && number / Math.max(total - number, 1) > 0.1 && number / Math.max(total - number, 1) < 0.2) ?? 0;
  return invoiceFieldsSchema.parse({ vendorName: lines.find((line) => !/\d/.test(line)) ?? "", customerName: "", vendorTaxId: taxId, invoiceNumber, issueDate, projectName: lines.find((line) => /(?:مشروع|project|موقع|site)/i.test(line)) ?? "", subtotal: Math.max(total - vat, 0), vat, total, currency: "SAR", confidence: taxId || total ? 0.5 : 0.25, category: "مشتريات / فاتورة ضريبية", warnings: ["تم استخدام استخراج احتياطي؛ راجع الحقول يدوياً."] });
}

function contentToText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part as { text?: string }).text ?? ""))
      .join("\n");
  }
  return "";
}

function parseModelJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI returned an unreadable result");
  return invoiceFieldsSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
}

function hasUsefulFields(result: ReturnType<typeof invoiceFieldsSchema.parse>) {
  return Boolean(result.vendorName || result.vendorTaxId || result.invoiceNumber || result.issueDate || result.projectName || result.subtotal || result.vat || result.total);
}

async function extractPdfText(dataUrl: string) {
  const match = dataUrl.match(/^data:application\/pdf;base64,(.+)$/s);
  if (!match) return "";
  const parser = new PDFParse({ data: Buffer.from(match[1], "base64") });
  try {
    const result = await parser.getText();
    return result.text?.trim() ?? "";
  } finally {
    await parser.destroy();
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  invoice: router({
    analyze: publicProcedure
      .input(z.object({ imageUrl: z.string().min(1), mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]).default("image/jpeg"), language: z.enum(["ar", "en"]).default("ar") }))
      .mutation(async ({ input }) => {
        const language = input.language === "ar" ? "العربية" : "English";
        if (input.mimeType === "application/pdf") {
          const pdfText = await extractPdfText(input.imageUrl).catch(() => "");
          if (pdfText) {
            const extracted = fallbackFromText(pdfText);
            if (hasUsefulFields(extracted)) return extracted;
          }
        }
        const response = await invokeLLM({
          model: "gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `أنت محاسب دقيق ومتخصص في الفواتير السعودية. اقرأ صورة الفاتورة واستخرج القيم فقط من الصورة. أعد JSON صالحاً بلا Markdown باللغة ${language}. لا تخمّن؛ اترك القيمة فارغة أو صفراً إذا لم تكن واضحة. تحقق من أن الرقم الضريبي 15 رقماً عندما يظهر. أضف warnings عند تعارض أو غموض OCR.`,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "استخرج اسم المورد أو البائع، اسم العميل أو الشركة المستلمة، الرقم الضريبي، رقم الفاتورة، التاريخ، اسم المشروع أو موقع العمل، المجموع قبل الضريبة، ضريبة القيمة المضافة، الإجمالي بعد الضريبة، العملة، وتصنيف الفاتورة مثل مشتريات أو مواد بناء أو خدمات أو نقل، مع نسبة ثقة إجمالية من 0 إلى 1.",
                },
                input.mimeType === "application/pdf"
                  ? { type: "file_url", file_url: { url: input.imageUrl, mime_type: input.mimeType } }
                  : { type: "image_url", image_url: { url: input.imageUrl, detail: "high" } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1200,
        });
        const text = contentToText(response.choices[0]?.message?.content);
        try {
          const parsed = parseModelJson(text);
          if (!hasUsefulFields(parsed)) throw new Error("AI returned empty invoice fields");
          return parsed;
        } catch {
          const fallback = fallbackFromText(text);
          if (!hasUsefulFields(fallback)) throw new Error("لم يتم استخراج بيانات من الملف؛ استخدم صورة واضحة أو PDF نصي");
          return fallback;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
