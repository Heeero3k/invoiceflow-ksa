import type { Express, Request, Response } from "express";
import { google } from "googleapis";
import { SignJWT, jwtVerify } from "jose";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { z } from "zod";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const stateSecret = () => new TextEncoder().encode(ENV.cookieSecret || "invoiceflow-development-secret");
const tokenKey = () => createHash("sha256").update(ENV.cookieSecret || "invoiceflow-development-secret").digest();

function encryptRefreshToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}

function decryptRefreshToken(value: string) {
  const [ivHex, tagHex, encryptedHex] = value.split(".");
  if (!ivHex || !tagHex || !encryptedHex) return value;
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
}

const exportBodySchema = z.object({
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).min(1).max(5000),
  spreadsheetId: z.string().min(5).optional(),
  title: z.string().min(1).max(120).default("InvoiceFlow KSA"),
});

function configured() {
  return Boolean(ENV.googleClientId && ENV.googleClientSecret);
}

function redirectUri(req: Request) {
  return ENV.googleRedirectUri || `${req.protocol}://${req.get("host")}/api/google/sheets/callback`;
}

function oauthClient(req: Request) {
  return new google.auth.OAuth2(ENV.googleClientId, ENV.googleClientSecret, redirectUri(req));
}

async function issueState(userId: number, returnTo: string) {
  return new SignJWT({ userId, returnTo })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(stateSecret());
}

async function verifyState(state: string) {
  const verified = await jwtVerify(state, stateSecret(), { algorithms: ["HS256"] });
  const payload = verified.payload as { userId?: number; returnTo?: string };
  if (!payload.userId || !payload.returnTo) throw new Error("Invalid Google OAuth state");
  return payload as { userId: number; returnTo: string };
}

function safeReturnTo(value: unknown, req: Request) {
  const candidate = typeof value === "string" ? value : "";
  if (candidate.startsWith("invoiceflow") || candidate.startsWith("manus")) return candidate;
  if (candidate.startsWith("https://")) {
    try {
      const candidateHost = new URL(candidate).host.replace(/^8081-/, "3000-");
      if (candidateHost === req.get("host")) return candidate;
    } catch {
      // Fall back to the app deep link for malformed return URLs.
    }
  }
  return "invoiceflow://settings?sheets=connected";
}

export function registerGoogleSheetsRoutes(app: Express) {
  app.get("/api/google/sheets/status", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const connection = await db.getGoogleSheetsConnection(user.id);
      return res.json({ connected: Boolean(connection), spreadsheetId: connection?.spreadsheetId ?? null, spreadsheetUrl: connection?.spreadsheetUrl ?? null });
    } catch (error) {
      return res.status(401).json({ connected: false, error: error instanceof Error ? error.message : "Not authenticated" });
    }
  });

  app.get("/api/google/sheets/connect", async (req: Request, res: Response) => {
    try {
      if (!configured()) return res.status(503).json({ error: "Google Sheets OAuth is not configured on the server" });
      const user = await sdk.authenticateRequest(req);
      const state = await issueState(user.id, safeReturnTo(req.query.returnTo, req));
      const client = oauthClient(req);
      const url = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [GOOGLE_SHEETS_SCOPE, GOOGLE_DRIVE_FILE_SCOPE],
        state,
      });
      return res.json({ url });
    } catch (error) {
      return res.status(401).json({ error: error instanceof Error ? error.message : "Google authorization unavailable" });
    }
  });

  app.get("/api/google/sheets/callback", async (req: Request, res: Response) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    try {
      const { userId, returnTo } = await verifyState(state);
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code) throw new Error("Google did not return an authorization code");
      const client = oauthClient(req);
      const { tokens } = await client.getToken(code);
      if (!tokens.refresh_token) throw new Error("Google did not return a refresh token; revoke access and try again");
      await db.upsertGoogleSheetsConnection({ userId, refreshToken: encryptRefreshToken(tokens.refresh_token), spreadsheetId: null, spreadsheetUrl: null });
      return res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}sheets=connected`);
    } catch (error) {
      const message = encodeURIComponent(error instanceof Error ? error.message : "Google connection failed");
      const fallback = state ? "invoiceflow://settings" : "/api/health";
      return res.redirect(`${fallback}${fallback.includes("?") ? "&" : "?"}sheets=error&message=${message}`);
    }
  });

  app.post("/api/google/sheets/export", async (req: Request, res: Response) => {
    try {
      if (!configured()) return res.status(503).json({ error: "Google Sheets OAuth is not configured on the server" });
      const user = await sdk.authenticateRequest(req);
      const payload = exportBodySchema.parse(req.body);
      const connection = await db.getGoogleSheetsConnection(user.id);
      if (!connection) return res.status(409).json({ error: "Connect Google Sheets before exporting" });
      const client = oauthClient(req);
      client.setCredentials({ refresh_token: decryptRefreshToken(connection.refreshToken) });
      const sheets = google.sheets({ version: "v4", auth: client });
      let spreadsheetId = payload.spreadsheetId || connection.spreadsheetId || "";
      if (!spreadsheetId) {
        const created = await sheets.spreadsheets.create({ requestBody: { properties: { title: payload.title }, sheets: [{ properties: { title: "الفواتير" } }] } });
        spreadsheetId = created.data.spreadsheetId || "";
        if (!spreadsheetId) throw new Error("Google did not return a spreadsheet id");
        await db.upsertGoogleSheetsConnection({ userId: user.id, refreshToken: connection.refreshToken, spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` });
        await sheets.spreadsheets.values.update({ spreadsheetId, range: "الفواتير!A1", valueInputOption: "USER_ENTERED", requestBody: { values: [["اسم المورد", "اسم العميل", "الرقم الضريبي", "رقم الفاتورة", "التاريخ", "المشروع / الموقع", "قبل الضريبة", "الضريبة", "الإجمالي بعد الضريبة", "العملة", "الحالة", "التصنيف", "حالة QR / ZATCA"]] } });
      }
      const result = await sheets.spreadsheets.values.append({ spreadsheetId, range: "الفواتير!A:Z", valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: payload.rows } });
      return res.json({ spreadsheetId, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, updatedRange: result.data.updates?.updatedRange || null });
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : 500;
      return res.status(status).json({ error: error instanceof Error ? error.message : "Google Sheets export failed" });
    }
  });
}
