// invite-student request handler (Workstream A). Dependency-injected: testable without Deno / Supabase.
// Written in "erasable" TypeScript so the same files run under Deno and under `node --test`.
//
// A signed-in TEACHER invites a student by e-mail. Unlike v1 it understands the state of an e-mail
// that already exists in Auth and answers with a specific, safe code instead of a generic 409:
//
//   no account                               -> invite (create + link [+ enroll]); rollback is verified
//   invited, not confirmed, mine             -> invite_pending      (action "resend" re-sends the invitation)
//   confirmed, no password yet, mine         -> password_not_set    (action "resend" sends a password link)
//   active, mine                             -> already_yours       (with course_id: enrolls them, status "enrolled_existing")
//   auth user WITHOUT a profile (ghost)      -> needs_repair        (action "repair" rebuilds profile + link, sends a password link)
//   unused student account nobody owns       -> needs_repair        (same; "unused" = never confirmed, never signed in)
//   anything else (other teacher's student, teachers, disabled, used but unlinked)
//                                            -> email_exists_other  (neutral; nothing is linked, no details leak)
//
// Security: identity from the JWT only; role from the DB; a password/recovery link only ever goes to the
// e-mail address itself (never returned to the client); no user ids of OTHER people are returned.

export type FailureCode =
  | "method_not_allowed" | "server_misconfigured" | "unauthorized" | "forbidden" | "invalid_json"
  | "invalid_email" | "invalid_name" | "invalid_language" | "invalid_action" | "course_not_found"
  | "invite_pending" | "password_not_set" | "already_yours" | "needs_repair" | "email_exists_other"
  | "invite_failed" | "resend_failed" | "repair_failed"
  | "link_failed" | "enroll_failed" | "partial_state";

export const STATUS: Record<FailureCode, number> = {
  method_not_allowed: 405, server_misconfigured: 500, unauthorized: 401, forbidden: 403, invalid_json: 400,
  invalid_email: 400, invalid_name: 400, invalid_language: 400, invalid_action: 400, course_not_found: 404,
  invite_pending: 409, password_not_set: 409, already_yours: 409, needs_repair: 409, email_exists_other: 409,
  invite_failed: 502, resend_failed: 502, repair_failed: 502,
  link_failed: 500, enroll_failed: 500, partial_state: 500,
};

export interface AuthUserState {
  user_id: string;
  email_confirmed: boolean;
  has_password: boolean;
  last_sign_in_at: string | null;
  is_disabled: boolean;
  has_profile: boolean;
  role: string | null;
  linked_to_caller: boolean;
  linked_to_others: boolean;
}

export type ProvisionResult = { ok: true } | { ok: false; code: string };

export interface Store {
  authenticate(): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{ role: string | null } | null>;
  getOwnCourse(courseId: string, ownerId: string): Promise<{ id: string; languages: string[] } | null>;
  findAuthUser(email: string, teacherId: string): Promise<AuthUserState | null>;
  inviteUser(email: string, fullName: string, redirectTo: string): Promise<{ ok: true; userId: string } | { ok: false; kind: "exists" | "failed" }>;
  sendRecovery(email: string, redirectTo: string): Promise<boolean>;
  provision(a: { teacherId: string; studentId: string; fullName: string; courseId: string | null; language: string | null; createProfile: boolean }): Promise<ProvisionResult>;
  deleteUser(userId: string): Promise<boolean>;
}

export interface HandlerDeps {
  allowedOrigins: string[];
  siteUrl: string | null;
  store: Store | null; // null => server misconfigured
  log?: (entry: Record<string, unknown>) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LANGUAGES = ["java", "python", "csharp", "c", "cpp", "javascript"];
const ACTIONS = ["invite", "resend", "repair"];

function cors(origin: string | null, allowed: string[]) {
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const send = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin, deps.allowedOrigins), "Content-Type": "application/json" } });
  const fail = (code: FailureCode, extra: Record<string, unknown> = {}) => send({ error: code, ...extra }, STATUS[code]);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin, deps.allowedOrigins) });
  if (req.method !== "POST") return fail("method_not_allowed");
  const store = deps.store;
  if (!store || !deps.siteUrl) return fail("server_misconfigured");
  const redirectTo = `${deps.siteUrl.replace(/\/$/, "")}/set-password`;

  // 1. identity from the JWT; 2. role from the DB
  const user = await store.authenticate().catch(() => null);
  if (!user) return fail("unauthorized");
  const profile = await store.getProfile(user.id).catch(() => null);
  if (!profile || profile.role !== "teacher") return fail("forbidden");
  const callerId = user.id;

  // 3. input
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("invalid_json");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("invalid_json");
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const action = body.action == null ? "invite" : String(body.action);
  const language = body.language == null || body.language === "" ? null : String(body.language);
  const courseId = body.course_id == null || body.course_id === "" ? null : String(body.course_id);
  if (!EMAIL_RE.test(email) || email.length > 254) return fail("invalid_email");
  if (fullName.length < 2 || fullName.length > 120) return fail("invalid_name");
  if (!ACTIONS.includes(action)) return fail("invalid_action");
  if (language !== null && !LANGUAGES.includes(language)) return fail("invalid_language");
  if (courseId !== null && !UUID_RE.test(courseId)) return fail("course_not_found");

  // 3b. course must be the caller's own, active course (checked BEFORE anything is created)
  let course: { id: string; languages: string[] } | null = null;
  if (courseId !== null) {
    course = await store.getOwnCourse(courseId, callerId).catch(() => null);
    if (!course) return fail("course_not_found");
    if (language !== null && !course.languages.includes(language)) return fail("invalid_language");
  } else if (language !== null) {
    return fail("invalid_language");
  }

  const provision = (studentId: string, createProfile: boolean) =>
    store.provision({ teacherId: callerId, studentId, fullName, courseId, language, createProfile });

  // 4. what state is this e-mail in?
  let found: AuthUserState | null;
  try {
    found = await store.findAuthUser(email, callerId);
  } catch {
    log({ event: "invite_student", stage: "lookup_failed" });
    return fail("invite_failed");
  }

  // ---- brand-new e-mail: invite, then link/enroll in ONE transaction, with a VERIFIED rollback ----
  if (!found) {
    if (action !== "invite") return fail("invalid_action");
    const inv = await store.inviteUser(email, fullName, redirectTo).catch(() => ({ ok: false, kind: "failed" } as const));
    if (!inv.ok) return inv.kind === "exists" ? fail("email_exists_other") : (log({ event: "invite_student", stage: "invite_failed" }), fail("invite_failed"));
    const res = await provision(inv.userId, false).catch(() => ({ ok: false, code: "exception" } as const));
    if (res.ok) return send({ status: "invited", student_id: inv.userId, enrolled: courseId !== null }, 200);
    return await rollback(inv.userId, res.code === "enroll" ? "enroll_failed" : "link_failed");
  }

  // ---- the e-mail exists ----
  if (found.is_disabled || found.role === "teacher") return fail("email_exists_other");
  const unused = !found.email_confirmed && found.last_sign_in_at === null;

  // ghost (no profile), or an unused, unowned student account (e.g. left by a failed rollback)
  const ghost = !found.has_profile;
  const claimable = found.has_profile && found.role === "student" && !found.linked_to_caller && !found.linked_to_others && unused;
  if (ghost || claimable) {
    if (action !== "repair") return fail("needs_repair");
    const res = await provision(found.user_id, ghost).catch(() => ({ ok: false, code: "exception" } as const));
    if (!res.ok) {
      log({ event: "invite_student", stage: "repair_failed", code: res.code });
      return fail("repair_failed");
    }
    const sent = ghost || found.email_confirmed ? await store.sendRecovery(email, redirectTo).catch(() => false)
                                                : await resendInvite();
    log({ event: "invite_student", stage: "repaired", ghost, mail_sent: sent });
    return send({ status: "repaired", student_id: found.user_id, enrolled: courseId !== null, mail_sent: sent }, 200);
  }

  // an active account that is not the caller's: nothing is revealed, nothing is linked
  if (found.role !== "student" || !found.linked_to_caller) return fail("email_exists_other");

  // ---- the caller's own student ----
  if (!found.email_confirmed) {
    if (action !== "resend") return fail("invite_pending");
    const sent = await resendInvite();
    return sent ? send({ status: "invite_resent" }, 200) : fail("resend_failed");
  }
  if (!found.has_password && found.last_sign_in_at === null) {
    if (action !== "resend") return fail("password_not_set");
    const sent = await store.sendRecovery(email, redirectTo).catch(() => false);
    return sent ? send({ status: "recovery_sent" }, 200) : fail("resend_failed");
  }
  if (courseId !== null) {
    const res = await provision(found.user_id, false).catch(() => ({ ok: false, code: "exception" } as const));
    return res.ok ? send({ status: "enrolled_existing", student_id: found.user_id, enrolled: true }, 200) : fail("enroll_failed");
  }
  return fail("already_yours");

  async function resendInvite(): Promise<boolean> {
    const r = await store.inviteUser(email, fullName, redirectTo).catch(() => ({ ok: false, kind: "failed" } as const));
    return r.ok;
  }

  // Undo a half-created user. NEVER pretend the system is clean when it is not.
  async function rollback(userId: string, code: "link_failed" | "enroll_failed") {
    let removed = await store.deleteUser(userId).catch(() => false);
    if (!removed) removed = await store.deleteUser(userId).catch(() => false); // one retry
    if (removed) {
      log({ event: "invite_student", stage: "rolled_back", code });
      return fail(code);
    }
    // Diagnosable: the id is an internal identifier (not PII). The health-check script lists such accounts.
    log({ event: "invite_student", stage: "rollback_failed", code, user_id: userId });
    return fail("partial_state", { partial: true });
  }
}
