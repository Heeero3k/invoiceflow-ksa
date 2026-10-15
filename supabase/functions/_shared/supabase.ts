import { createClient, type User } from "npm:@supabase/supabase-js@2.117.0";
import { AppError } from "./http.ts";

export function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the calling user from the request's Supabase JWT. */
export async function requireUser(req: Request): Promise<User> {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AppError("unauthorized", "Missing session", 401);
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new AppError("unauthorized", "Invalid session", 401);
  return data.user;
}
