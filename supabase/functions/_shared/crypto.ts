import { requireEnv } from "./http.ts";

// AES-256-GCM for refresh tokens, HMAC-SHA256 for OAuth state. Both keys derive
// from TOKEN_ENCRYPTION_KEY (a long random secret set with `supabase secrets set`).

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function keyMaterial(purpose: string) {
  const secret = requireEnv("TOKEN_ENCRYPTION_KEY");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`${purpose}:${secret}`)));
}

async function aesKey() {
  return crypto.subtle.importKey("raw", await keyMaterial("aes"), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function hmacKey() {
  return crypto.subtle.importKey("raw", await keyMaterial("hmac"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function encryptText(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), encoder.encode(plain)));
  return `${b64url(iv)}.${b64url(cipher)}`;
}

export async function decryptText(value: string) {
  const [iv, cipher] = value.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, await aesKey(), fromB64url(cipher));
  return decoder.decode(plain);
}

export async function signState(payload: Record<string, unknown>) {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(body)));
  return `${body}.${b64url(signature)}`;
}

export async function verifyState<T>(state: string): Promise<T> {
  const [body, signature] = state.split(".");
  if (!body || !signature) throw new Error("Malformed state");
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(signature), encoder.encode(body));
  if (!valid) throw new Error("Invalid state signature");
  const payload = JSON.parse(decoder.decode(fromB64url(body))) as T & { exp: number };
  if (payload.exp < Date.now()) throw new Error("State expired");
  return payload;
}
