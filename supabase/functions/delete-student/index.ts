// Edge Function: delete-student  (Workstream A)
// Explicit HARD delete of a student (archiving is the default in the UI). See handler.ts.
// Body: { student_id, mode: "preview" | "delete", confirm_name? }
// Secrets: ALLOWED_ORIGINS (shared with the other functions). Provided by Supabase: URL / anon / service role.
// Requires migration 20260930000100 (admin_student_footprint).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import { createStore } from "./store.ts";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);

Deno.serve((req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let store = null;
  if (url && anon && service) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(url, service, { auth: { persistSession: false } });
    store = createStore(userClient, adminClient);
  }
  return handleRequest(req, { allowedOrigins, store });
});
