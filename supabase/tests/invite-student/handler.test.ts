import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../functions/invite-student/handler.ts";
import type { AuthUserState, HandlerDeps, ProvisionResult, Store } from "../../functions/invite-student/handler.ts";

const TEACHER = "00000000-0000-4000-8000-0000000000a1";
const COURSE = "00000000-0000-4000-8000-0000000000c1";
const NEW_USER = "00000000-0000-4000-8000-0000000000f1";
const EXISTING = "00000000-0000-4000-8000-0000000000f2";

const state = (over: Partial<AuthUserState> = {}): AuthUserState => ({
  user_id: EXISTING, email_confirmed: true, has_password: true, last_sign_in_at: "2026-09-01T00:00:00Z", is_disabled: false,
  has_profile: true, role: "student", linked_to_caller: true, linked_to_others: false, ...over,
});

interface Opts {
  user?: { id: string } | null; role?: string | null; course?: { id: string; languages: string[] } | null;
  found?: AuthUserState | null; lookupThrows?: boolean;
  invite?: { ok: true; userId: string } | { ok: false; kind: "exists" | "failed" };
  provision?: ProvisionResult; deleteResults?: boolean[]; recovery?: boolean;
}

function harness(o: Opts = {}) {
  const calls: string[] = [];
  const logs: Record<string, unknown>[] = [];
  const provisions: Record<string, unknown>[] = [];
  const deletes = [...(o.deleteResults ?? [true])];
  const store: Store = {
    authenticate: async () => (calls.push("authenticate"), o.user === undefined ? { id: TEACHER } : o.user),
    getProfile: async () => (calls.push("getProfile"), o.role === undefined ? { role: "teacher" } : o.role === null ? null : { role: o.role }),
    getOwnCourse: async () => (calls.push("getOwnCourse"), o.course === undefined ? { id: COURSE, languages: ["java", "csharp"] } : o.course),
    findAuthUser: async () => { calls.push("findAuthUser"); if (o.lookupThrows) throw new Error("x"); return o.found === undefined ? null : o.found; },
    inviteUser: async () => (calls.push("inviteUser"), o.invite ?? { ok: true, userId: NEW_USER }),
    sendRecovery: async () => (calls.push("sendRecovery"), o.recovery ?? true),
    provision: async (a) => (calls.push("provision"), provisions.push(a as unknown as Record<string, unknown>), o.provision ?? { ok: true }),
    deleteUser: async () => (calls.push("deleteUser"), deletes.length > 1 ? deletes.shift()! : deletes[0]),
  };
  const deps: HandlerDeps = { allowedOrigins: ["https://app.example"], siteUrl: "https://app.example/", store, log: (e) => logs.push(e) };
  return { deps, calls, logs, provisions };
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://fn.example/invite-student", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const ok = { email: "New@Example.com ", full_name: "רגב יצחקי" };
const run = (h: ReturnType<typeof harness>, body: unknown = ok) => handleRequest(post(body), h.deps);

test("auth: 401 without a session, 403 for a student, nothing else touched", async () => {
  const a = harness({ user: null }); assert.equal((await run(a)).status, 401); assert.deepEqual(a.calls, ["authenticate"]);
  const b = harness({ role: "student" }); assert.equal((await run(b)).status, 403); assert.ok(!b.calls.includes("inviteUser"));
  assert.equal((await run(harness({ role: null }))).status, 403);
});

test("misconfigured server / wrong method / CORS", async () => {
  const h = harness(); h.deps.store = null; assert.equal((await run(h)).status, 500);
  const g = harness(); assert.equal((await handleRequest(new Request("https://x", { method: "GET" }), g.deps)).status, 405);
  const o = await handleRequest(new Request("https://x", { method: "OPTIONS", headers: { Origin: "https://app.example" } }), g.deps);
  assert.equal(o.headers.get("Access-Control-Allow-Origin"), "https://app.example");
  const bad = await handleRequest(new Request("https://x", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), g.deps);
  assert.equal(bad.headers.get("Access-Control-Allow-Origin"), "");
});

test("validation happens before any lookup or creation", async () => {
  const cases: [unknown, string][] = [
    [{ email: "nope", full_name: "אב" }, "invalid_email"], [{ email: "a@b.co", full_name: "א" }, "invalid_name"],
    [{ ...ok, action: "delete" }, "invalid_action"], [{ ...ok, language: "cobol" }, "invalid_language"],
    [{ ...ok, language: "java" }, "invalid_language"], // language without a course
    [{ ...ok, course_id: "not-a-uuid" }, "course_not_found"], ["not json", "invalid_json"], [[1], "invalid_json"],
  ];
  for (const [body, code] of cases) {
    const h = harness(); const res = await run(h, body);
    assert.equal((await res.json()).error, code, JSON.stringify(body));
    assert.ok(!h.calls.includes("inviteUser") && !h.calls.includes("findAuthUser"), "no side effects: " + JSON.stringify(body));
  }
});

test("course must be the caller's own; language must be one of the course's languages", async () => {
  const a = harness({ course: null }); const ra = await run(a, { ...ok, course_id: COURSE });
  assert.equal(ra.status, 404); assert.ok(!a.calls.includes("inviteUser"));
  const b = harness({ course: { id: COURSE, languages: ["java"] } }); const rb = await run(b, { ...ok, course_id: COURSE, language: "csharp" });
  assert.equal((await rb.json()).error, "invalid_language"); assert.ok(!b.calls.includes("inviteUser"));
});

test("NEW student: invite + link in one provision call; response keeps student_id/enrolled (backward compatible)", async () => {
  const h = harness(); const res = await run(h);
  assert.equal(res.status, 200); const j = await res.json();
  assert.equal(j.student_id, NEW_USER); assert.equal(j.enrolled, false); assert.equal(j.status, "invited");
  assert.equal(h.provisions[0].createProfile, false); assert.equal(h.provisions[0].courseId, null);
  const h2 = harness(); const j2 = await (await run(h2, { ...ok, course_id: COURSE, language: "csharp" })).json();
  assert.equal(j2.enrolled, true); assert.equal(h2.provisions[0].language, "csharp");
});

test("NEW student: link failure -> verified rollback -> error, and the rollback is logged", async () => {
  const h = harness({ provision: { ok: false, code: "link" }, deleteResults: [true] });
  const res = await run(h); assert.equal(res.status, 500); assert.equal((await res.json()).error, "link_failed");
  assert.ok(h.calls.includes("deleteUser")); assert.ok(h.logs.some((l) => l.stage === "rolled_back"));
  const e = harness({ provision: { ok: false, code: "enroll" }, deleteResults: [true] });
  assert.equal((await (await run(e, { ...ok, course_id: COURSE })).json()).error, "enroll_failed");
});

test("NEW student: ROLLBACK FAILURE is never reported as success and is diagnosable (A5)", async () => {
  const h = harness({ provision: { ok: false, code: "link" }, deleteResults: [false, false] });
  const res = await run(h); const j = await res.json();
  assert.equal(res.status, 500); assert.equal(j.error, "partial_state"); assert.equal(j.partial, true);
  assert.equal(h.calls.filter((c) => c === "deleteUser").length, 2, "one retry");
  const l = h.logs.find((x) => x.stage === "rollback_failed"); assert.ok(l); assert.equal(l!.user_id, NEW_USER);
  // a thrown deleteUser counts as a failure too
  const t = harness({ provision: { ok: false, code: "link" } }); t.deps.store!.deleteUser = async () => { throw new Error("boom"); };
  assert.equal((await (await run(t)).json()).error, "partial_state");
  // the second attempt succeeding is a clean rollback
  const r = harness({ provision: { ok: false, code: "link" }, deleteResults: [false, true] });
  assert.equal((await (await run(r)).json()).error, "link_failed");
});

test("invite failure: race on 'already registered' -> neutral code; other failures -> 502", async () => {
  assert.equal((await (await run(harness({ invite: { ok: false, kind: "exists" } }))).json()).error, "email_exists_other");
  const f = await run(harness({ invite: { ok: false, kind: "failed" } })); assert.equal(f.status, 502);
  const l = harness({ lookupThrows: true }); assert.equal((await run(l)).status, 502); assert.ok(!l.calls.includes("inviteUser"));
});

test("EXISTING, mine, invited but not confirmed -> invite_pending; action=resend re-sends", async () => {
  const s = state({ email_confirmed: false, has_password: false, last_sign_in_at: null });
  const a = harness({ found: s }); const ra = await run(a); assert.equal(ra.status, 409); assert.equal((await ra.json()).error, "invite_pending");
  assert.ok(!a.calls.includes("inviteUser"));
  const b = harness({ found: s }); const rb = await run(b, { ...ok, action: "resend" });
  assert.equal(rb.status, 200); assert.equal((await rb.json()).status, "invite_resent"); assert.ok(b.calls.includes("inviteUser"));
  const c = harness({ found: s, invite: { ok: false, kind: "failed" } }); assert.equal((await run(c, { ...ok, action: "resend" })).status, 502);
});

test("EXISTING, mine, confirmed but never set a password -> password_not_set; resend sends a password link", async () => {
  const s = state({ has_password: false, last_sign_in_at: null });
  const a = harness({ found: s }); assert.equal((await (await run(a)).json()).error, "password_not_set");
  const b = harness({ found: s }); const rb = await run(b, { ...ok, action: "resend" });
  assert.equal((await rb.json()).status, "recovery_sent"); assert.ok(b.calls.includes("sendRecovery"));
});

test("EXISTING, mine, active -> already_yours; with a course it just enrolls them", async () => {
  const a = harness({ found: state() }); const ra = await run(a); assert.equal(ra.status, 409); assert.equal((await ra.json()).error, "already_yours");
  assert.ok(!a.calls.includes("inviteUser") && !a.calls.includes("provision"));
  const b = harness({ found: state() }); const rb = await run(b, { ...ok, course_id: COURSE, language: "java" });
  assert.equal(rb.status, 200); assert.equal((await rb.json()).status, "enrolled_existing");
  assert.equal(b.provisions[0].createProfile, false); assert.ok(!b.calls.includes("inviteUser"));
  const c = harness({ found: state(), provision: { ok: false, code: "enroll" } }); assert.equal((await (await run(c, { ...ok, course_id: COURSE })).json()).error, "enroll_failed");
});

test("GHOST (auth user without a profile) -> needs_repair; action=repair rebuilds profile+link and mails a password link", async () => {
  const g = state({ has_profile: false, role: null, linked_to_caller: false });
  const a = harness({ found: g }); const ra = await run(a); assert.equal(ra.status, 409); assert.equal((await ra.json()).error, "needs_repair");
  assert.ok(!a.calls.includes("provision"), "nothing changes without an explicit repair");
  const b = harness({ found: g }); const rb = await run(b, { ...ok, action: "repair", course_id: COURSE });
  assert.equal(rb.status, 200); const j = await rb.json(); assert.equal(j.status, "repaired"); assert.equal(j.mail_sent, true);
  assert.equal(b.provisions[0].createProfile, true); assert.equal(b.provisions[0].studentId, EXISTING); assert.ok(b.calls.includes("sendRecovery"));
  assert.ok(!("action_link" in j) && !JSON.stringify(j).includes("token"), "no link/token ever reaches the client");
  const c = harness({ found: g, provision: { ok: false, code: "link" } }); assert.equal((await run(c, { ...ok, action: "repair" })).status, 502);
});

test("UNUSED unowned student account (e.g. left by a failed rollback) can be claimed; a USED one cannot", async () => {
  const unused = state({ email_confirmed: false, has_password: false, last_sign_in_at: null, linked_to_caller: false });
  const a = harness({ found: unused }); assert.equal((await (await run(a)).json()).error, "needs_repair");
  const b = harness({ found: unused }); const rb = await run(b, { ...ok, action: "repair" });
  assert.equal(rb.status, 200); assert.equal(b.provisions[0].createProfile, false); assert.ok(b.calls.includes("inviteUser"), "unconfirmed -> the invitation is re-sent");
  const used = state({ linked_to_caller: false }); // confirmed + has signed in, linked to nobody
  const c = harness({ found: used }); assert.equal((await (await run(c, { ...ok, action: "repair" })).json()).error, "email_exists_other");
  assert.ok(!c.calls.includes("provision"), "no takeover of a live account");
});

test("NO account takeover: other teacher's student, teachers, disabled -> neutral email_exists_other, nothing linked, no ids leaked", async () => {
  const cases = [state({ linked_to_caller: false, linked_to_others: true }), state({ role: "teacher" }), state({ is_disabled: true })];
  for (const s of cases) {
    for (const action of ["invite", "resend", "repair"]) {
      const h = harness({ found: s }); const res = await run(h, { ...ok, action }); const txt = await res.text();
      assert.equal(res.status, 409); assert.equal(JSON.parse(txt).error, "email_exists_other");
      assert.ok(!h.calls.includes("provision") && !h.calls.includes("inviteUser") && !h.calls.includes("sendRecovery"), JSON.stringify(s) + action);
      assert.ok(!txt.includes(EXISTING), "no user id leaks");
    }
  }
});

test("repair/resend on an e-mail that does not exist is refused (no accidental account creation)", async () => {
  const h = harness({ found: null }); assert.equal((await run(h, { ...ok, action: "repair" })).status, 400); assert.ok(!h.calls.includes("inviteUser"));
});
