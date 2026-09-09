import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const invoiceFieldsSchema = z.object({
  vendorName: z.string().default(""),
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
});

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
                  text: "استخرج اسم البائع، الرقم الضريبي، رقم الفاتورة، التاريخ، اسم المشروع أو الموقع، المجموع قبل الضريبة، ضريبة القيمة المضافة، الإجمالي، العملة، ونسبة ثقة إجمالية من 0 إلى 1.",
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
        return parseModelJson(text);
      }),
  }),
});

export type AppRouter = typeof appRouter;
