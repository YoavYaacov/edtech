// Edge Function: ai-variant  (Phase 6 final round, C2)
// A signed-in TEACHER asks for an AI *proposal* of a language variant of one of his questions.
// AI proposes, the teacher decides: nothing is saved here. The browser saves a variant only after the
// teacher reviews/edits it and presses Save (through the existing save_question_variant RPC).
//
// Body: { "question_id": "<uuid>", "target_language": "csharp" }   (nothing else is accepted)
//
// Secrets (Dashboard -> Edge Functions -> Secrets): GEMINI_API_KEY (same secret as ai-review), ALLOWED_ORIGINS (shared).
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Requires migration 20261002000100 (ai_variant_runs).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleRequest } from "./handler.ts";
import { createStore } from "./store.ts";
import { createGeminiVariantAdapter } from "./geminiAdapter.ts";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);

Deno.serve((req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  let store = null;
  if (url && anon && service) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(url, service, { auth: { persistSession: false } });
    store = createStore(userClient, adminClient);
  }

  return handleRequest(req, {
    allowedOrigins,
    store,
    getProvider: () => (geminiKey ? createGeminiVariantAdapter({ apiKey: geminiKey }) : null),
  });
});
