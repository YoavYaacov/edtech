import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../functions/delete-student/handler.ts";
import type { Footprint, HandlerDeps, Store } from "../../functions/delete-student/handler.ts";

const TEACHER = "00000000-0000-4000-8000-0000000000a1";
const STUDENT = "00000000-0000-4000-8000-0000000000b1";
const FP: Footprint = { found: true, role: "student", linked_to_caller: true, other_teachers: 0, enrollments: 1, assignments: 3, answers: 4, submissions: 5, feedback: 2, notifications: 6 };

interface Opts { user?: { id: string } | null; role?: string | null; fp?: Footprint; after?: Footprint; deletes?: boolean[]; name?: string | null; fpThrows?: boolean }
function harness(o: Opts = {}) {
  const calls: string[] = []; const logs: Record<string, unknown>[] = [];
  const deletes = [...(o.deletes ?? [true])]; let fpCalls = 0;
  const store: Store = {
    authenticate: async () => (calls.push("authenticate"), o.user === undefined ? { id: TEACHER } : o.user),
    getProfile: async () => (calls.push("getProfile"), o.role === undefined ? { role: "teacher" } : o.role === null ? null : { role: o.role }),
    studentName: async () => (o.name === undefined ? "רגב יצחקי" : o.name),
    footprint: async () => { calls.push("footprint"); if (o.fpThrows) throw new Error("x"); fpCalls++; return fpCalls === 1 ? (o.fp ?? FP) : (o.after ?? { found: false }); },
    deleteUser: async () => (calls.push("deleteUser"), deletes.length > 1 ? deletes.shift()! : deletes[0]),
  };
  const deps: HandlerDeps = { allowedOrigins: ["https://app.example"], store, log: (e) => logs.push(e) };
  return { deps, calls, logs };
}
const post = (body: unknown) => new Request("https://fn.example/delete-student", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const run = (h: ReturnType<typeof harness>, body: unknown) => handleRequest(post(body), h.deps);
const preview = { student_id: STUDENT, mode: "preview" };
const del = { student_id: STUDENT, mode: "delete", confirm_name: "רגב יצחקי" };

test("authorization: 401 / 403, and nothing is read or deleted", async () => {
  const a = harness({ user: null }); assert.equal((await run(a, del)).status, 401); assert.deepEqual(a.calls, ["authenticate"]);
  const b = harness({ role: "student" }); assert.equal((await run(b, del)).status, 403); assert.ok(!b.calls.includes("deleteUser") && !b.calls.includes("footprint"));
});

test("input: bad ids / modes -> 400; a teacher cannot delete themselves", async () => {
  for (const b of [{}, { student_id: "x", mode: "delete" }, { student_id: STUDENT, mode: "nuke" }, "not json", [1]]) {
    const h = harness(); assert.equal((await run(h, b)).status, 400, JSON.stringify(b)); assert.ok(!h.calls.includes("deleteUser"));
  }
  const s = harness(); assert.equal((await run(s, { student_id: TEACHER, mode: "delete", confirm_name: "x" })).status, 404); assert.ok(!s.calls.includes("deleteUser"));
});

test("ownership: unknown, teacher accounts and other teachers' students all look like 404", async () => {
  for (const fp of [{ found: false }, { ...FP, linked_to_caller: false }, { ...FP, role: "teacher" }] as Footprint[]) {
    const h = harness({ fp }); assert.equal((await run(h, del)).status, 404); assert.ok(!h.calls.includes("deleteUser"));
  }
});

test("a student who also belongs to another teacher is never hard-deleted (archive only)", async () => {
  const h = harness({ fp: { ...FP, other_teachers: 1 } }); const r = await run(h, del);
  assert.equal(r.status, 409); assert.equal((await r.json()).error, "shared_student"); assert.ok(!h.calls.includes("deleteUser"));
});

test("preview shows what would be removed and changes nothing", async () => {
  const h = harness(); const r = await run(h, preview); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.status, "preview"); assert.equal(j.student_name, "רגב יצחקי");
  assert.deepEqual(j.counts, { enrollments: 1, assignments: 3, answers: 4, submissions: 5, feedback: 2, notifications: 6 });
  assert.ok(!h.calls.includes("deleteUser"));
});

test("delete needs the exact student name; a wrong or missing confirmation deletes nothing", async () => {
  for (const c of [undefined, "", "רגב", "רגב יצחקי2"]) {
    const h = harness(); const r = await run(h, { ...del, confirm_name: c });
    assert.equal(r.status, 400); assert.equal((await r.json()).error, "confirmation_mismatch"); assert.ok(!h.calls.includes("deleteUser"));
  }
  const noName = harness({ name: null }); assert.equal((await run(noName, { ...del, confirm_name: "" })).status, 400);
});

test("delete: starts at the AUTH user (no ghost), verifies afterwards, returns counts", async () => {
  const h = harness(); const r = await run(h, del); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.status, "deleted"); assert.equal(j.counts.submissions, 5);
  assert.deepEqual(h.calls.filter((c) => c === "deleteUser").length, 1);
  assert.ok(h.calls.lastIndexOf("footprint") > h.calls.indexOf("deleteUser"), "verified after deleting");
  assert.ok(h.logs.some((l) => l.stage === "deleted"));
});

test("partial failure: retry once; still failing -> 502 + log, never success", async () => {
  const a = harness({ deletes: [false, true] }); assert.equal((await run(a, del)).status, 200);
  const b = harness({ deletes: [false, false] }); const r = await run(b, del);
  assert.equal(r.status, 502); assert.equal((await r.json()).error, "delete_failed"); assert.ok(b.logs.some((l) => l.stage === "delete_failed"));
  // the auth call "succeeded" but the student is still there -> reported as incomplete
  const c = harness({ after: FP }); const rc = await run(c, del);
  assert.equal(rc.status, 500); assert.equal((await rc.json()).error, "delete_incomplete"); assert.ok(c.logs.some((l) => l.stage === "delete_incomplete"));
  assert.equal((await run(harness({ fpThrows: true }), del)).status, 502);
});
