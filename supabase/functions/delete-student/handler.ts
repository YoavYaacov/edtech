// delete-student request handler (Workstream A). Dependency-injected, erasable TypeScript.
//
// HARD delete of a student. Archiving is the default in the product; this is a separate, explicit action.
//   { student_id, mode: "preview" }                       -> what would be removed (nothing changes)
//   { student_id, mode: "delete", confirm_name: "<name>" }-> deletes
//
// Rules: signed-in TEACHER; the student must be linked to the caller; a student who also belongs to another
// teacher is never hard-deleted (archive only). The deletion STARTS at the auth user (auth.admin.deleteUser):
// the FK cascade removes the profile and every application row, so no "ghost" auth user can be left behind.
// It is verified afterwards; a failure is logged and reported, never reported as success.

export type FailureCode =
  | "method_not_allowed" | "server_misconfigured" | "unauthorized" | "forbidden" | "bad_request"
  | "not_found" | "shared_student" | "confirmation_mismatch" | "delete_failed" | "delete_incomplete";

export const STATUS: Record<FailureCode, number> = {
  method_not_allowed: 405, server_misconfigured: 500, unauthorized: 401, forbidden: 403, bad_request: 400,
  not_found: 404, shared_student: 409, confirmation_mismatch: 400, delete_failed: 502, delete_incomplete: 500,
};

export interface Footprint {
  found: boolean;
  role?: string;
  linked_to_caller?: boolean;
  other_teachers?: number;
  enrollments?: number;
  assignments?: number;
  answers?: number;
  submissions?: number;
  feedback?: number;
  notifications?: number;
}

export interface Store {
  authenticate(): Promise<{ id: string } | null>;
  getProfile(userId: string): Promise<{ role: string | null } | null>;
  studentName(studentId: string): Promise<string | null>;
  footprint(teacherId: string, studentId: string): Promise<Footprint>;
  deleteUser(userId: string): Promise<boolean>;
}

export interface HandlerDeps {
  allowedOrigins: string[];
  store: Store | null;
  log?: (entry: Record<string, unknown>) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const fail = (code: FailureCode) => send({ error: code }, STATUS[code]);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin, deps.allowedOrigins) });
  if (req.method !== "POST") return fail("method_not_allowed");
  const store = deps.store;
  if (!store) return fail("server_misconfigured");

  const user = await store.authenticate().catch(() => null);
  if (!user) return fail("unauthorized");
  const profile = await store.getProfile(user.id).catch(() => null);
  if (!profile || profile.role !== "teacher") return fail("forbidden");

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("bad_request");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("bad_request");
  }
  const studentId = typeof body.student_id === "string" ? body.student_id : "";
  const mode = body.mode;
  if (!UUID_RE.test(studentId) || (mode !== "preview" && mode !== "delete")) return fail("bad_request");
  if (studentId === user.id) return fail("not_found"); // a teacher can never delete themselves

  // ownership: the student must be linked to THIS teacher. Missing and not-yours look identical.
  let fp: Footprint;
  try {
    fp = await store.footprint(user.id, studentId);
  } catch {
    log({ event: "delete_student", stage: "footprint_failed" });
    return fail("delete_failed");
  }
  if (!fp.found || fp.role !== "student" || !fp.linked_to_caller) return fail("not_found");
  if ((fp.other_teachers ?? 0) > 0) return fail("shared_student");

  const counts = {
    enrollments: fp.enrollments ?? 0, assignments: fp.assignments ?? 0, answers: fp.answers ?? 0,
    submissions: fp.submissions ?? 0, feedback: fp.feedback ?? 0, notifications: fp.notifications ?? 0,
  };
  const name = (await store.studentName(studentId).catch(() => null)) ?? "";

  if (mode === "preview") return send({ status: "preview", student_name: name, counts }, 200);

  // explicit confirmation: the teacher types the student's name
  const confirm = typeof body.confirm_name === "string" ? body.confirm_name.trim() : "";
  if (name.trim() === "" || confirm !== name.trim()) return fail("confirmation_mismatch");

  let removed = await store.deleteUser(studentId).catch(() => false);
  if (!removed) removed = await store.deleteUser(studentId).catch(() => false); // one retry
  if (!removed) {
    log({ event: "delete_student", stage: "delete_failed", student_id: studentId });
    return fail("delete_failed");
  }
  // verify: nothing may be left (no ghost auth user, no profile)
  const after = await store.footprint(user.id, studentId).catch(() => ({ found: true } as Footprint));
  if (after.found) {
    log({ event: "delete_student", stage: "delete_incomplete", student_id: studentId });
    return fail("delete_incomplete");
  }
  log({ event: "delete_student", stage: "deleted" });
  return send({ status: "deleted", counts }, 200);
}
