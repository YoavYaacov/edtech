// Edge Function: invite-student
// A signed-in TEACHER invites a student by email.
// Optional course_id: the new student is also enrolled in that course, atomically
// (if enrollment fails, the invited user is removed — no partial state).
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
  let body: { email?: unknown; full_name?: unknown; course_id?: unknown };
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
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const courseId = body.course_id == null || body.course_id === "" ? null : String(body.course_id);
  if (courseId !== null && !UUID_RE.test(courseId)) {
    return json({ error: "course_not_found" }, 404, origin);
  }

  // 3b. If a course was given: it must be the caller's own, active course.
  //     Checked BEFORE inviting, so a bad course never creates a user.
  //     (The service role bypasses RLS, so ownership is checked explicitly.)
  if (courseId !== null) {
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("owner_id", callerId)
      .eq("is_archived", false)
      .maybeSingle();
    if (courseError || !course) {
      return json({ error: "course_not_found" }, 404, origin);
    }
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

  // 6. Optional: enroll in the course. On failure, remove the new user
  //    (cascade removes the teacher↔student link too) — no partial state.
  if (courseId !== null) {
    const { error: enrollError } = await admin
      .from("course_enrollments")
      .insert({ course_id: courseId, student_id: studentId });
    if (enrollError) {
      console.error("enroll failed", enrollError);
      await admin.auth.admin.deleteUser(studentId);
      return json({ error: "enroll_failed" }, 500, origin);
    }
  }

  return json({ student_id: studentId, enrolled: courseId !== null }, 200, origin);
});
