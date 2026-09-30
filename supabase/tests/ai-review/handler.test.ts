import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../functions/ai-review/handler.ts";
import { AiReviewError } from "../../functions/ai-review/errors.ts";
import { GOOD_RESULT, OTHER_TEACHER_ID, SUBMISSION_ID, harness, post, rawSubmission } from "./helpers.ts";

const call = (h: ReturnType<typeof harness>, body: unknown = { submission_id: SUBMISSION_ID }, headers?: Record<string, string>) =>
  handleRequest(post(body, headers), h.deps);

test("A. authentication failure -> 401, nothing else touched", async () => {
  const h = harness({ user: null });
  const res = await call(h);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { status: "error", error_type: "unauthorized", message: "נדרשת התחברות." });
  assert.deepEqual(h.calls, ["authenticate"]);
  assert.equal(h.providerInputs.length, 0);
});

test("B. non-teacher (student) rejected -> 403, no data load, no provider", async () => {
  const h = harness({ role: "student" });
  const res = await call(h);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error_type, "forbidden");
  assert.deepEqual(h.calls, ["authenticate", "getProfile"]);
  assert.equal(h.providerInputs.length, 0);
});

test("B2. profile missing -> 403", async () => {
  const h = harness({ role: null });
  assert.equal((await call(h)).status, 403);
});

test("C. submission of another teacher: RLS returns nothing -> 404", async () => {
  const h = harness({ raw: null });
  const res = await call(h);
  assert.equal(res.status, 404);
  assert.equal(h.providerInputs.length, 0);
  assert.equal(h.runs.length, 0);
});

test("C2. defense in depth: even if RLS returned another owner's row -> 404, provider not called", async () => {
  const h = harness({ raw: rawSubmission({ owner_id: OTHER_TEACHER_ID }) });
  const res = await call(h);
  assert.equal(res.status, 404);
  assert.equal(h.providerInputs.length, 0);
  assert.equal(h.runs.length, 0);
  assert.ok(h.logs.some((l) => l.stage === "ownership_mismatch"));
});

test("D. missing submission / malformed input -> 404 / 400", async () => {
  assert.equal((await call(harness({ raw: null }))).status, 404);
  const bad = [{}, { submission_id: "nope" }, { submission_id: 5 }, [SUBMISSION_ID], "not json", null];
  for (const b of bad) {
    const h = harness();
    assert.equal((await call(h, b)).status, 400, JSON.stringify(b));
    assert.equal(h.providerInputs.length, 0);
  }
});

test("D2. client may send ONLY submission_id (no injected context/prompt/model/verdict)", async () => {
  for (const extra of ["question_text", "student_answer", "reference_solution", "teacher_context", "verdict", "prompt", "model", "provider"]) {
    const h = harness();
    const res = await call(h, { submission_id: SUBMISSION_ID, [extra]: "forged" });
    assert.equal(res.status, 400, extra);
    assert.equal(h.providerInputs.length, 0);
  }
});

test("E. valid request: context assembled server-side, audit run recorded, exact schema returned", async () => {
  const h = harness();
  const res = await call(h);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "ok", run_id: "run-1", result: GOOD_RESULT });
  assert.deepEqual(h.calls, ["authenticate", "getProfile", "loadSubmission", "recordRun"]);
  assert.deepEqual(h.providerInputs[0], {
    question: {
      title: "חיבור שני מספרים",
      body_md: "כתוב פונקציה sum שמחזירה את סכום שני מספרים שלמים.",
      question_type: "code",
      programming_language: "java",
      starter_code: "int sum(int a, int b) {\n}",
    },
    reference: { solution_code: "int sum(int a, int b) { return a + b; }", explanation_md: "מחזירים a+b." },
    student_answer: "int sum(int a, int b) { return a + b }",
  });
  const run = h.runs[0];
  assert.equal(run.status, "ok");
  assert.equal(run.provider, "google");
  assert.equal(run.model, "gemini-3.5-flash-lite");
  assert.equal(run.prompt_version, "ai-review-v2");
  assert.match(run.input_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(run.structured_result, GOOD_RESULT);
  assert.equal(Object.keys(body.result).length, 8);
  assert.ok(!("proposed_mistake_tag_ids" in body.result));
});

test("E2. missing required context (empty answer / no question) -> 422 without calling the provider", async () => {
  for (const raw of [rawSubmission({ content: "   " }), rawSubmission({ body_md: "" }), rawSubmission({ title: null, body_md: null })]) {
    const h = harness({ raw });
    const res = await call(h);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error_type, "missing_context");
    assert.equal(h.providerInputs.length, 0);
  }
});

test("E3. reference solution is optional", async () => {
  const h = harness({ raw: rawSubmission({ solution_code: null, explanation_md: null }) });
  assert.equal((await call(h)).status, 200);
  assert.equal((h.providerInputs[0] as any).reference, null);
});

test("E4. same input -> same input_hash; different answer -> different hash", async () => {
  const a = harness(); await call(a);
  const b = harness(); await call(b);
  const c = harness({ raw: rawSubmission({ content: "other" }) }); await call(c);
  assert.equal(a.runs[0].input_hash, b.runs[0].input_hash);
  assert.notEqual(a.runs[0].input_hash, c.runs[0].input_hash);
});

test("J. provider errors -> clean contract, workflow untouched, audit status mapped", async () => {
  const table: [string, number, string][] = [
    ["timeout", 504, "timeout"],
    ["quota_exceeded", 429, "quota_exceeded"],
    ["server_overload", 503, "error"],
    ["invalid_output", 502, "invalid_output"],
    ["no_connection", 502, "error"],
    ["provider_error", 502, "error"],
  ];
  for (const [t, status, runStatus] of table) {
    const h = harness({ providerError: new AiReviewError(t as any, "SECRET raw provider text sk-123") });
    const res = await call(h);
    const text = await res.text();
    assert.equal(res.status, status, t);
    const body = JSON.parse(text);
    assert.deepEqual(Object.keys(body).sort(), ["error_type", "message", "status"]);
    assert.equal(body.status, "error");
    assert.equal(body.error_type, t);
    assert.ok(!text.includes("SECRET") && !text.includes("sk-123"));
    assert.equal(h.runs[0].status, runStatus);
    assert.equal(h.runs[0].structured_result, null);
    assert.equal(h.runs[0].error_message, t);
  }
});

test("J2. AI unavailable message is the approved simple Hebrew text", async () => {
  const res = await call(harness({ providerError: new AiReviewError("timeout") }));
  assert.equal((await res.json()).message, "לא ניתן לבצע כרגע ניתוח AI. אפשר להמשיך לבדוק את התשובה ידנית.");
});

test("J3. unexpected exception from provider -> internal_error, no leak", async () => {
  const h = harness();
  h.deps.getProvider = () => ({ provider: "google", model: "m", reviewAnswer: async () => { throw new Error("boom sk-999"); } });
  const res = await call(h);
  const text = await res.text();
  assert.equal(res.status, 500);
  assert.ok(!text.includes("boom") && !text.includes("sk-999"));
});

test("J4. missing API key / missing Supabase env -> server_misconfigured (500)", async () => {
  assert.equal((await call(harness({ noProvider: true }))).status, 500);
  assert.equal((await call(harness({ noStore: true }))).status, 500);
});

test("J5. audit-row failure never blocks the teacher's result", async () => {
  const h = harness({ recordFails: true });
  const res = await call(h);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).run_id, null);
});

test("logs contain no PII / content", async () => {
  const h = harness();
  await call(h);
  const s = JSON.stringify(h.logs);
  assert.ok(!s.includes("sum") && !s.includes("דנה") && !s.includes("example.invalid"));
  assert.deepEqual(Object.keys(h.logs[0]).sort(), ["event", "latency_ms", "status", "submission_id"]);
});

test("CORS: preflight ok, unknown origin gets empty allow-origin, GET rejected", async () => {
  const h = harness();
  const pre = await handleRequest(new Request("https://x.test", { method: "OPTIONS", headers: { Origin: "https://app.example" } }), h.deps);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "https://app.example");
  const evil = await handleRequest(post({ submission_id: SUBMISSION_ID }, { Authorization: "Bearer t", Origin: "https://evil.example" }), h.deps);
  assert.equal(evil.headers.get("Access-Control-Allow-Origin"), "");
  assert.equal((await handleRequest(new Request("https://x.test", { method: "GET" }), h.deps)).status, 405);
});
