export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Error with a stable machine-readable code the app maps to a localized message. */
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) return json({ error: error.code, message: error.message }, error.status);
  console.error(error);
  return json({ error: "internal", message: error instanceof Error ? error.message : "Unexpected error" }, 500);
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new AppError("not_configured", `${name} is not configured on the server`, 503);
  return value;
}
