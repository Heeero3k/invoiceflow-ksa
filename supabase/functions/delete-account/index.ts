// Permanently deletes the caller's account, files and data (App Store / Play requirement).
import { corsHeaders, errorResponse, json } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

async function removeFolder(bucket: string, folder: string) {
  const storage = adminClient().storage.from(bucket);
  for (;;) {
    const { data, error } = await storage.list(folder, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) return;
    const { error: removeError } = await storage.remove(data.map((item) => `${folder}/${item.name}`));
    if (removeError) throw removeError;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    await removeFolder("invoice-files", user.id);
    await removeFolder("exports", user.id);
    // Rows in every app table reference auth.users with ON DELETE CASCADE.
    const { error } = await adminClient().auth.admin.deleteUser(user.id);
    if (error) throw error;
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
});
