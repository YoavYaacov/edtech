// Edge Function: invite-student  (v2 — Workstream A, Student/Auth hardening)
// A signed-in TEACHER invites a student by e-mail. See handler.ts for the full decision table.
// Body: { email, full_name, course_id?, language?, action?: "invite" | "resend" | "repair" }
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   SITE_URL          e.g. https://your-app.vercel.app  (links land on SITE_URL/set-password)
//   ALLOWED_ORIGINS   comma-separated, e.g. http://localhost:5173,https://your-app.vercel.app
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Requires migrations up to 20260930000200 (admin_find_auth_user, admin_provision_student).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import { createStore } from "./store.ts";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);

Deno.serve((req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("SITE_URL") ?? null;

  let store = null;
  if (url && anon && service) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(url, service, { auth: { persistSession: false } });
    const anonClient = createClient(url, anon, { auth: { persistSession: false } });
    store = createStore(userClient, adminClient, anonClient);
  }
  return handleRequest(req, { allowedOrigins, siteUrl, store });
});
