import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { handleRequest } from "../../functions/ai-review/handler.ts";
import { createStore, SUBMISSION_SELECT } from "../../functions/ai-review/store.ts";
import { GOOD_RESULT, SUBMISSION_ID, STUDENT_ID, TEACHER_ID, harness, post, rawSubmission } from "./helpers.ts";

const ROOT = resolve(import.meta.dirname!, "../../..");
const FN_DIR = join(ROOT, "supabase/functions/ai-review");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test("L. AI Review performs no workflow action: the store exposes no write besides the audit row", async () => {
  const h = harness();
  await handleRequest(post({ submission_id: SUBMISSION_ID }), h.deps);
  assert.deepEqual(h.calls, ["authenticate", "getProfile", "loadSubmission", "recordRun"]);
  assert.deepEqual(Object.keys(h.deps.store!).sort(), ["authenticate", "getProfile", "loadSubmission", "recordRun"]);
});

test("L2. source scan: function code never calls feedback/return/release/notification RPCs or writes other tables", () => {
  const code = walk(FN_DIR).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(f, "utf8")).join("\n");
  for (const forbidden of [".rpc(", "save_feedback", "release_feedback", "release_ready_feedback", "return_for_revision(", "return_for_revision'", "submit_answer", "notifications", "VITE_"]) {
    assert.ok(!code.includes(forbidden), `forbidden reference: ${forbidden}`);
  }
  // only table writes: ai_runs insert
  assert.deepEqual([...code.matchAll(/\.(insert|update|upsert|delete)\(/g)].map((m) => m[1]), ["insert"]);
  assert.ok(/from\("ai_runs"\)\.insert/.test(code));
});

test("M. recommend_return_for_revision=true + needs_fix is returned as DATA only: no return call, nothing but the audit row is written", async () => {
  const rec = { ...GOOD_RESULT, proposed_verdict: "needs_fix" as const, recommend_return_for_revision: true, return_for_revision_reason: "כדאי לתקן." };
  const h = harness({ providerResult: rec });
  const res = await handleRequest(post({ submission_id: SUBMISSION_ID }), h.deps);
  const body = await res.json();
  assert.equal(body.result.recommend_return_for_revision, true);
  assert.equal(body.result.proposed_verdict, "needs_fix");
  assert.deepEqual(h.calls, ["authenticate", "getProfile", "loadSubmission", "recordRun"]);
});

test("M2. confidence is stored for traceability only (no automation branch on it)", async () => {
  for (const c of [0, 1]) {
    const h = harness({ providerResult: { ...GOOD_RESULT, confidence: c } });
    assert.equal((await handleRequest(post({ submission_id: SUBMISSION_ID }), h.deps)).status, 200);
    assert.deepEqual(h.calls, ["authenticate", "getProfile", "loadSubmission", "recordRun"]);
  }
  const code = walk(FN_DIR).filter((f) => f.endsWith("handler.ts")).map((f) => readFileSync(f, "utf8")).join("\n");
  assert.ok(!/\.confidence/.test(code.replace(/\/\/.*$/gm, "")));
});

test("N. existing app untouched: from src/, ONLY the Round 1B client module + its thin reviewApi wrapper refer to ai-review; no migration was added/modified beyond ai_runs", () => {
  // Round 1A asserted "no reference at all". Round 1B adds exactly one production reference point.
  const allowed = ["src/features/review/aiReviewClient.js", "src/features/review/reviewApi.js"]; // client + its thin wrapper
  const refs = walk(join(ROOT, "src"))
    .filter((f) => readFileSync(f, "utf8").includes("ai-review"))
    .map((f) => f.slice(ROOT.length + 1))
    .filter((f) => !f.includes("/__tests__/"));
  assert.deepEqual(refs, allowed);
  const mig = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  assert.deepEqual(mig.slice(0, -1).at(-1), "20260926000100_notifications.sql");
  assert.equal(mig.at(-1), "20260929000100_ai_runs.sql");
});

// ---- store: reads via the caller client (RLS), service role only for the audit insert ----
function fakeClient(tables: Record<string, any>, log: string[], name: string) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: TEACHER_ID, email: "t@x.invalid" } }, error: null }) },
    from(table: string) {
      const q: any = { table, filters: {} as Record<string, unknown> };
      q.select = (cols: string) => { log.push(`${name}.select(${table}):${cols}`); q.cols = cols; return q; };
      q.eq = (k: string, v: unknown) => { q.filters[k] = v; return q; };
      q.maybeSingle = async () => ({ data: tables[table] ?? null, error: null });
      q.single = async () => ({ data: tables[table] ?? null, error: null });
      q.insert = (row: unknown) => { log.push(`${name}.insert(${table})`); q.row = row; return q; };
      return q;
    },
  };
}

test("store: assembles a RawSubmission from embedded rows (object or array embeds) and never selects PII columns", async () => {
  const log: string[] = [];
  const submissionRow = {
    id: SUBMISSION_ID, content: "answer",
    answer: { student_id: STUDENT_ID, assignment_question: {
      title: "t", body_md: "b", question_type: "code", programming_language: "java", starter_code: "s",
      assignment: [{ owner_id: TEACHER_ID }], solution: { solution_code: "sol", explanation_md: "exp" } } },
  };
  const user = fakeClient({ answer_submissions: submissionRow, profiles: { full_name: "Dana", role: "teacher" } }, log, "user");
  const admin = fakeClient({ ai_runs: { id: "run-9" } }, log, "admin");
  const store = createStore(user, admin);
  const raw = await store.loadSubmission(SUBMISSION_ID);
  assert.deepEqual(raw, {
    submission_id: SUBMISSION_ID, owner_id: TEACHER_ID, student_id: STUDENT_ID, student_name: "Dana", content: "answer",
    title: "t", body_md: "b", question_type: "code", programming_language: "java", starter_code: "s",
    solution_code: "sol", explanation_md: "exp",
  });
  assert.ok(!/email|phone|auth\.|parent|family/i.test(SUBMISSION_SELECT));
  assert.ok(log.filter((l) => l.startsWith("user.select(profiles)")).every((l) => l.endsWith(":full_name")));
  assert.equal(await store.recordRun({ ...({} as any) }), "run-9");
  assert.ok(log.includes("admin.insert(ai_runs)"));
  assert.ok(!log.some((l) => l.startsWith("user.insert")), "caller client never writes");
});

test("store: RLS hides the row -> null (not found)", async () => {
  const store = createStore(fakeClient({}, [], "user"), fakeClient({}, [], "admin"));
  assert.equal(await store.loadSubmission(SUBMISSION_ID), null);
});
