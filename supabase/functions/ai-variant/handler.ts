// ai-variant request handler. Dependency-injected: testable without Deno / Supabase / Gemini.
//
// Contract: POST { "question_id": "<uuid>", "target_language": "csharp" } — nothing else is accepted.
// AI PROPOSES, TEACHER DECIDES: this function only READS the question, calls the provider and (best effort)
// records an audit row. It NEVER writes a variant, never changes the question, never publishes or assigns.
import { CLIENT_MESSAGE, HTTP_STATUS, VariantError, runStatusFor } from "./errors.ts";
import type { VariantErrorType } from "./errors.ts";
import { SUPPORTED, assemblePayload, expectationFor, inputHash } from "./context.ts";
import type { RawQuestion } from "./context.ts";
import type { VariantProvider } from "./provider.ts";
import { PROMPT_VERSION } from "./prompt.ts";
import type { VariantResult } from "./schema.ts";

export interface AuthedUser { id: string; email: string | null }

export interface RunRecord {
  teacher_id: string;
  question_id: string;
  source_language: string;
  target_language: string;
  provider: string;
  model: string;
  prompt_version: string;
  input_hash: string;
  status: "ok" | "error" | "timeout" | "quota_exceeded" | "invalid_output";
  latency_ms: number;
  structured_result: VariantResult | null;
  error_message: string | null;
}

// All data access. store.ts reads with the CALLER's JWT (RLS) and uses the service role ONLY in recordRun.
export interface Store {
  authenticate(authHeader: string): Promise<AuthedUser | null>;
  getProfile(userId: string): Promise<{ role: string | null } | null>;
  loadQuestion(questionId: string): Promise<RawQuestion | null>;
  recordRun(run: RunRecord): Promise<string | null>;
}

export interface HandlerDeps {
  allowedOrigins: string[];
  store: Store | null;
  getProvider: () => VariantProvider | null;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 2048;

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
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const send = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin, deps.allowedOrigins), "Content-Type": "application/json" } });
  const fail = (t: VariantErrorType) => send({ status: "error", error_type: t, message: CLIENT_MESSAGE[t] }, HTTP_STATUS[t]);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin, deps.allowedOrigins) });
  if (req.method !== "POST") return send({ status: "error", error_type: "bad_request", message: CLIENT_MESSAGE.bad_request }, 405);
  if (!deps.store) return fail("server_misconfigured");
  const store = deps.store;

  const user = await store.authenticate(req.headers.get("Authorization") ?? "").catch(() => null);
  if (!user) return fail("unauthorized");
  const profile = await store.getProfile(user.id).catch(() => null);
  if (!profile || profile.role !== "teacher") return fail("forbidden");

  let questionId = "";
  let target = "";
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail("bad_request");
    const body = JSON.parse(text);
    const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body).sort() : [];
    if (keys.join(",") !== "question_id,target_language" || typeof body.question_id !== "string" || !UUID_RE.test(body.question_id)
        || typeof body.target_language !== "string" || !SUPPORTED.includes(body.target_language)) return fail("bad_request");
    questionId = body.question_id;
    target = body.target_language;
  } catch {
    return fail("bad_request");
  }

  let raw: RawQuestion | null;
  try {
    raw = await store.loadQuestion(questionId);
  } catch {
    log({ event: "ai_variant", question_id: questionId, status: "error", error_type: "internal_error", stage: "load" });
    return fail("internal_error");
  }
  if (!raw) return fail("not_found");
  if (raw.owner_id !== user.id) {
    log({ event: "ai_variant", question_id: questionId, status: "error", error_type: "not_found", stage: "ownership_mismatch" });
    return fail("not_found");
  }

  // request validation against the question (neutral / no base language / same language / unsupported / already exists)
  let payload;
  try {
    payload = assemblePayload(raw, target);
  } catch (e) {
    return fail(e instanceof VariantError ? e.errorType : "internal_error");
  }

  const provider = deps.getProvider();
  if (!provider) {
    log({ event: "ai_variant", question_id: questionId, status: "error", error_type: "server_misconfigured", stage: "no_provider_key" });
    return fail("server_misconfigured");
  }

  const started = now();
  let hash = "";
  let outcome: { result: VariantResult } | { error: VariantError };
  try {
    hash = await inputHash(payload, PROMPT_VERSION, provider.model);
    outcome = { result: await provider.proposeVariant(payload, expectationFor(payload)) };
  } catch (e) {
    outcome = { error: e instanceof VariantError ? e : new VariantError("internal_error", "unexpected") };
  }
  const latency = Math.max(0, now() - started);

  let runId: string | null = null;
  if (hash) {
    const base = {
      teacher_id: user.id, question_id: questionId, source_language: payload.source_language, target_language: target,
      provider: provider.provider, model: provider.model, prompt_version: PROMPT_VERSION, input_hash: hash, latency_ms: latency,
    };
    const run: RunRecord = "result" in outcome
      ? { ...base, status: "ok", structured_result: outcome.result, error_message: null }
      : { ...base, status: runStatusFor(outcome.error.errorType), structured_result: null, error_message: outcome.error.errorType };
    try {
      runId = await store.recordRun(run);
    } catch {
      log({ event: "ai_variant", question_id: questionId, stage: "record_run_failed" });
    }
  }

  if ("error" in outcome) {
    const t = outcome.error.errorType;
    log({ event: "ai_variant", question_id: questionId, status: "error", error_type: t, latency_ms: latency });
    return fail(t);
  }
  log({ event: "ai_variant", question_id: questionId, status: "ok", latency_ms: latency });
  return send({ status: "ok", run_id: runId, source_language: payload.source_language, result: outcome.result }, 200);
}
