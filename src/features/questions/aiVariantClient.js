// Phase 6 final round / C2 — client side of the ai-variant Edge Function.
//
// AI proposes, the teacher decides. This module only ASKS for a proposal. It never saves a variant
// (saving goes through save_question_variant, after the teacher reviews and presses Save).
//
// Security: the Supabase client already holds the teacher's session; functions.invoke attaches it.
// The body is EXACTLY { question_id, target_language }: the question content, the provider, model, prompt
// and key are all resolved server-side. No API key exists in the browser.

export const AI_VARIANT_FUNCTION = 'ai-variant';
// The server aborts the provider after 45s; the browser waits a little longer so the server's own error arrives first.
export const CLIENT_TIMEOUT_MS = 55_000;

export const KNOWN_ERRORS = [
  'unauthorized', 'forbidden', 'bad_request', 'not_found', 'neutral_question', 'not_programming', 'same_language',
  'invalid_language', 'variant_exists', 'missing_context', 'timeout', 'quota_exceeded', 'server_overload',
  'no_connection', 'invalid_output', 'provider_error', 'server_misconfigured', 'internal_error',
];

export const buildAiVariantBody = (questionId, targetLanguage) => ({ question_id: questionId, target_language: targetLanguage });

const fail = (errorType) => ({ ok: false, errorType });

// Keeps only what the UI shows. Anything malformed => invalid_output (never a partial proposal).
export function pickProposal(r) {
  if (!r || typeof r !== 'object') return null;
  for (const k of ['target_language', 'body_md', 'starter_code', 'solution_code', 'explanation_md']) if (typeof r[k] !== 'string') return null;
  if (!Array.isArray(r.hints) || r.hints.length > 3) return null;
  if (r.hints.some((h) => !h || !Number.isInteger(h.level) || typeof h.content_md !== 'string')) return null;
  if (!Array.isArray(r.warnings) || r.warnings.some((w) => typeof w !== 'string')) return null;
  return {
    language: r.target_language, body_md: r.body_md, starter_code: r.starter_code, solution_code: r.solution_code,
    explanation_md: r.explanation_md, hints: [...r.hints].sort((a, b) => a.level - b.level),
    warnings: r.warnings, confidence: typeof r.confidence === 'number' ? r.confidence : null,
  };
}

async function errorTypeOf(error, signal) {
  if (signal.aborted) return 'timeout';
  try {
    const body = await error.context?.json?.();
    if (body && KNOWN_ERRORS.includes(body.error_type)) return body.error_type;
  } catch { /* non-JSON body */ }
  const status = error.context?.status;
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') return 'no_connection';
  return 'internal_error';
}

// client: a Supabase client (injected for tests). One explicit request, one question, one target language.
export async function requestAiVariant(client, questionId, targetLanguage, { timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  if (!client) return fail('no_connection');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data, error } = await client.functions.invoke(AI_VARIANT_FUNCTION, {
      body: buildAiVariantBody(questionId, targetLanguage), signal: ctrl.signal,
    });
    if (error) return fail(await errorTypeOf(error, ctrl.signal));
    const proposal = data?.status === 'ok' && data.result?.target_language === targetLanguage ? pickProposal(data.result) : null;
    if (!proposal) return fail('invalid_output');
    return { ok: true, runId: data.run_id ?? null, sourceLanguage: data.source_language ?? null, proposal };
  } catch {
    return fail(ctrl.signal.aborted ? 'timeout' : 'no_connection');
  } finally {
    clearTimeout(timer);
  }
}
