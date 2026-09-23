// Edge Function: invite-student
// A signed-in TEACHER invites a student by email.
// Runs on Supabase servers; the service role key never reaches the browser.
//
// Required secrets (supabase secrets set ...):
//   SITE_URL          e.g. https://your-app.vercel.app  (invite link lands on SITE_URL/set-password)
//   ALLOWED_ORIGINS   comma-separated, e.g. http://localhost:5173,https://your-app.vercel.app
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("SITE_URL");
  if (!supabaseUrl || !anonKey || !serviceKey || !siteUrl) {
    return json({ error: "server_misconfigured" }, 500, origin);
  }

  // 1. Identify the caller from their JWT (never trust the body for identity).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: "unauthorized" }, 401, origin);
  }
  const callerId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 2. Caller must be a teacher (role read from the DB, not from the token).
  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();
  if (profileError || callerProfile?.role !== "teacher") {
    return json({ error: "forbidden" }, 403, origin);
  }

  // 3. Validate input.
  let body: { email?: unknown; full_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "invalid_email" }, 400, origin);
  }
  if (fullName.length < 2 || fullName.length > 120) {
    return json({ error: "invalid_name" }, 400, origin);
  }

  // 4. Invite. The DB trigger creates the profile with role = 'student'.
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl.replace(/\/$/, "")}/set-password`,
  });
  if (inviteError || !invited?.user) {
    const msg = (inviteError?.message ?? "").toLowerCase();
    if (msg.includes("already") || inviteError?.status === 422) {
      return json({ error: "email_exists" }, 409, origin);
    }
    console.error("invite failed", inviteError);
    return json({ error: "invite_failed" }, 502, origin);
  }
  const studentId = invited.user.id;

  // 5. Link teacher ↔ student. On failure, remove the half-created user.
  const { error: linkError } = await admin
    .from("teacher_students")
    .insert({ teacher_id: callerId, student_id: studentId });
  if (linkError) {
    console.error("link failed", linkError);
    await admin.auth.admin.deleteUser(studentId);
    return json({ error: "link_failed" }, 500, origin);
  }

  return json({ student_id: studentId }, 200, origin);
});
