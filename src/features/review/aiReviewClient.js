// Phase 6 / Round 1B — client side of the ai-review Edge Function (Round 1A, server).
//
// AI proposes, the teacher decides. This module only ASKS for a proposal. It never
// saves feedback, never changes a verdict, never releases or returns anything.
//
// Security notes:
//  * The Supabase client already holds the teacher's session; functions.invoke attaches
//    its access token itself. No JWT is read, stored or passed around here.
//  * The request body is EXACTLY { submission_id }. Question text, the student's answer,
//    names, ids, the reference solution, the prompt, the model and any key are all
//    resolved server-side from that id (Round 1A) — the client cannot inject context.
//  * Only the fields the UI needs are kept from the response; `confidence` is dropped on
//    purpose (it is not calibrated and must not drive anything — decision 135).

export const AI_REVIEW_FUNCTION = 'ai-review';
// The server aborts the provider after 20s (decision: timeout = 20s). The browser waits a
// little longer so the server's own error contract normally arrives first.
export const CLIENT_TIMEOUT_MS = 30_000;

export const VERDICTS = ['correct', 'partial', 'needs_fix', 'incorrect'];
export const KNOWN_ERRORS = [
  'unauthorized', 'forbidden', 'bad_request', 'not_found', 'missing_context', 'timeout',
  'quota_exceeded', 'server_overload', 'no_connection', 'invalid_output', 'provider_error',
  'server_misconfigured', 'internal_error',
];

export const buildAiReviewBody = (submissionId) => ({ submission_id: submissionId });

const fail = (errorType) => ({ ok: false, errorType });

// Keeps only what the UI shows. Anything malformed => invalid_output (never a partial card).
export function pickResult(r) {
  if (!r || typeof r !== 'object') return null;
  if (!VERDICTS.includes(r.proposed_verdict)) return null;
  if (typeof r.teacher_analysis !== 'string' || typeof r.proposed_student_feedback !== 'string') return null;
  if (typeof r.recommend_return_for_revision !== 'boolean' || typeof r.needs_teacher_attention !== 'boolean') return null;
  if (!Array.isArray(r.warnings) || r.warnings.some((w) => typeof w !== 'string')) return null;
  return {
    proposedVerdict: r.proposed_verdict,
    teacherAnalysis: r.teacher_analysis,
    proposedStudentFeedback: r.proposed_student_feedback,
    recommendReturn: r.recommend_return_for_revision,
    returnReason: typeof r.return_for_revision_reason === 'string' ? r.return_for_revision_reason : '',
    needsAttention: r.needs_teacher_attention,
    warnings: r.warnings,
  };
}

async function errorTypeOf(error, signal) {
  if (signal.aborted) return 'timeout';
  try {
    const body = await error.context?.json?.();
    if (body && KNOWN_ERRORS.includes(body.error_type)) return body.error_type;
  } catch { /* non-JSON body */ }
  const status = error.context?.status;
  if (status === 401) return 'unauthorized'; // e.g. the platform rejected an expired token
  if (status === 403) return 'forbidden';
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') return 'no_connection';
  return 'internal_error';
}

// client: a Supabase client (injected so it can be tested). One explicit request, one submission.
export async function requestAiReview(client, submissionId, { timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  if (!client) return fail('no_connection');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data, error } = await client.functions.invoke(AI_REVIEW_FUNCTION, {
      body: buildAiReviewBody(submissionId),
      signal: ctrl.signal,
    });
    if (error) return fail(await errorTypeOf(error, ctrl.signal));
    const result = data?.status === 'ok' ? pickResult(data.result) : null;
    if (!result) return fail('invalid_output');
    return { ok: true, runId: data.run_id ?? null, result };
  } catch {
    return fail(ctrl.signal.aborted ? 'timeout' : 'no_connection');
  } finally {
    clearTimeout(timer);
  }
}

// ---- per-submission memory (session only) -------------------------------------------
// FeedbackForm remounts when the teacher switches question. Keeping a finished proposal in
// memory means navigating away and back does not force a second request (free-tier quota).
// It is NOT persisted anywhere and is never written to the feedback draft.
const finished = new Map();
const inflight = new Map();

export const getCachedAiReview = (submissionId) => finished.get(submissionId) ?? null;
export const getInflightAiReview = (submissionId) => inflight.get(submissionId) ?? null;

// Starts a request unless one is already running for this submission (double-click guard).
export function startAiReview(client, submissionId, opts) {
  const running = inflight.get(submissionId);
  if (running) return running;
  const p = requestAiReview(client, submissionId, opts)
    .then((r) => { if (r.ok) finished.set(submissionId, r); return r; })
    .finally(() => inflight.delete(submissionId));
  inflight.set(submissionId, p);
  return p;
}

export function resetAiReviewMemory() { finished.clear(); inflight.clear(); }
