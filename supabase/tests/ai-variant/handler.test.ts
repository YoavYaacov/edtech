import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../../functions/ai-variant/handler.ts";
import { VariantError } from "../../functions/ai-variant/errors.ts";
import { GOOD_RESULT, goodBody, harness, post, rawQuestion, OTHER } from "./helpers.ts";

const j = async (r: Response) => ({ status: r.status, body: await r.json() });

test("success: returns the proposal and records ok run; nothing else is written", async () => {
  const h = harness();
  const { status, body } = await j(await handleRequest(post(goodBody), h.deps));
  assert.equal(status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.run_id, "run-1");
  assert.equal(body.source_language, "java");
  assert.deepEqual(body.result, GOOD_RESULT);
  assert.equal(h.runs.length, 1);
  assert.equal(h.runs[0].status, "ok");
  assert.equal(h.runs[0].source_language, "java");
  assert.equal(h.runs[0].target_language, "csharp");
  assert.match(h.runs[0].input_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(h.calls, ["authenticate", "getProfile", "loadQuestion", "provider", "recordRun"]); // no write method exists on the Store besides recordRun
});

test("CORS preflight and method check", async () => {
  const h = harness();
  const pre = await handleRequest(new Request("https://f.invalid/", { method: "OPTIONS", headers: { Origin: "https://app.example" } }), h.deps);
  assert.equal(pre.status, 200);
  assert.equal((await handleRequest(new Request("https://f.invalid/", { method: "GET" }), h.deps)).status, 405);
});

test("unauthenticated -> 401, student -> 403, provider never called", async () => {
  let h = harness({ user: null });
  assert.equal((await handleRequest(post(goodBody), h.deps)).status, 401);
  h = harness({ role: "student" });
  assert.equal((await handleRequest(post(goodBody), h.deps)).status, 403);
  assert.ok(!h.calls.includes("provider"));
});

test("exact body: extra keys, bad uuid, unsupported language, oversized -> 400", async () => {
  for (const b of [{ ...goodBody, extra: 1 }, { question_id: "x", target_language: "csharp" }, { ...goodBody, target_language: "cobol" }, { question_id: goodBody.question_id }, [], "nope", "{" + " ".repeat(3000) + "}"]) {
    const h = harness();
    const r = await handleRequest(post(b), h.deps);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 40));
    assert.ok(!h.calls.includes("provider"));
  }
});

test("question of another teacher / missing -> 404 (no provider call, no existence leak)", async () => {
  let h = harness({ raw: rawQuestion({ owner_id: OTHER }) });
  assert.equal((await handleRequest(post(goodBody), h.deps)).status, 404);
  h = harness({ raw: null });
  assert.equal((await handleRequest(post(goodBody), h.deps)).status, 404);
  assert.ok(!h.calls.includes("provider"));
});

test("rejections before the provider: neutral, same language, unsupported by course, variant exists, no base language", async () => {
  const cases: [Parameters<typeof rawQuestion>[0], string, number][] = [
    [{ is_language_neutral: true }, "neutral_question", 422],
    [{ course_languages: ["java"] }, "invalid_language", 422],
    [{ variant_languages: ["csharp"] }, "variant_exists", 409],
    [{ programming_language: null, course_primary_language: null }, "not_programming", 422],
    [{ programming_language: "csharp" }, "same_language", 422],
  ];
  for (const [over, type, status] of cases) {
    const h = harness({ raw: rawQuestion(over) });
    const r = await j(await handleRequest(post(goodBody), h.deps));
    assert.equal(r.status, status, type);
    assert.equal(r.body.error_type, type);
    assert.ok(!h.calls.includes("provider"), type);
    assert.equal(h.runs.length, 0);
  }
});

test("unclassified question uses the course primary language as source", async () => {
  const h = harness({ raw: rawQuestion({ programming_language: null }) });
  const r = await j(await handleRequest(post(goodBody), h.deps));
  assert.equal(r.body.source_language, "java");
});

test("provider failures map to fixed Hebrew messages, audit row is status-specific, no raw text leaks", async () => {
  for (const [t, st, run] of [["timeout", 504, "timeout"], ["quota_exceeded", 429, "quota_exceeded"], ["invalid_output", 502, "invalid_output"], ["server_overload", 503, "error"], ["no_connection", 502, "error"]] as const) {
    const h = harness({ providerError: new VariantError(t, "SECRET-PROVIDER-TEXT sk-abc") });
    const r = await handleRequest(post(goodBody), h.deps);
    const text = await r.text();
    assert.equal(r.status, st);
    assert.ok(!text.includes("SECRET"));
    assert.match(JSON.parse(text).message, /הבסיס לא השתנה/);
    assert.equal(h.runs[0].status, run);
    assert.equal(h.runs[0].structured_result, null);
    assert.ok(!JSON.stringify(h.runs[0]).includes("SECRET"));
  }
});

test("a failed audit insert does not fail the request", async () => {
  const h = harness({ recordFails: true });
  const r = await j(await handleRequest(post(goodBody), h.deps));
  assert.equal(r.status, 200);
  assert.equal(r.body.run_id, null);
});

test("missing provider key / missing store -> server_misconfigured 500", async () => {
  assert.equal((await handleRequest(post(goodBody), harness({ noProvider: true }).deps)).status, 500);
  assert.equal((await handleRequest(post(goodBody), harness({ noStore: true }).deps)).status, 500);
});

test("question load failure -> 500 internal_error", async () => {
  assert.equal((await handleRequest(post(goodBody), harness({ loadThrows: true }).deps)).status, 500);
});

test("audit + logs contain no PII or secrets and the provider input has no ids/emails", async () => {
  const h = harness();
  await handleRequest(post(goodBody), h.deps);
  const blob = JSON.stringify([h.runs, h.logs, h.providerInputs]);
  assert.ok(!blob.includes("t@example.invalid"));
  assert.ok(!/Bearer|apikey|x-goog/i.test(blob));
  assert.ok(!JSON.stringify([h.logs, h.providerInputs]).includes("00000000-0000-4000-8000-0000000000a1")); // teacher id only in the audit row
});
