// R1B-1 — client side of the import-process Edge Function.
//
// ONE call = at most ONE chunk, processed on the server. The browser only paces the work; all state lives in the database.
// Security: the Supabase client already holds the teacher's session (functions.invoke attaches it). The body is EXACTLY
// { import_id }: the file, the model, the prompt and the key are all resolved server-side. No API key exists in the browser.
// This module never creates a question: it only asks the server to extract PROPOSALS (AI proposes, the teacher approves).

export const IMPORT_PROCESS_FUNCTION = 'import-process';
// The server aborts Gemini after 90s; the browser waits a little longer so the server's own answer arrives first.
export const CLIENT_TIMEOUT_MS = 130_000;

export const KNOWN_ERRORS = [
  'unauthorized', 'forbidden', 'bad_request', 'not_found', 'not_processing', 'budget_exceeded', 'lease_lost',
  'timeout', 'quota_exceeded', 'server_overload', 'no_connection', 'invalid_output', 'provider_error',
  'storage_error', 'pdf_unreadable', 'server_misconfigured', 'internal_error',
];

export const buildImportProcessBody = (importId) => ({ import_id: importId });

const fail = (errorType, extra = {}) => ({ kind: 'error', errorType, ...extra });
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// Turns the server's JSON into one small, validated shape. Anything malformed => internal_error (never a partial guess).
export function normalizeStep(data) {
  if (!data || typeof data !== 'object') return fail('internal_error');
  const chunk = data.chunk && typeof data.chunk === 'object'
    ? { seq: num(data.chunk.seq), pageFrom: num(data.chunk.page_from), pageTo: num(data.chunk.page_to), kind: data.chunk.kind ?? 'standard' }
    : null;
  switch (data.status) {
    case 'done':
      return {
        kind: 'done', chunk, inserted: num(data.inserted), dropped: num(data.dropped), limitReached: Boolean(data.limit_reached),
        warnings: Array.isArray(data.warnings) ? data.warnings.filter((w) => typeof w === 'string') : [],
        importStatus: typeof data.import_status === 'string' ? data.import_status : null,
        callsToday: num(data.calls_today, null), dailyCalls: num(data.daily_ai_calls, null),
      };
    case 'split':
      return { kind: 'split', chunk, reason: typeof data.reason === 'string' ? data.reason : '', children: num(data.children) };
    case 'idle':
      return {
        kind: 'idle', openChunks: num(data.open_chunks),
        nextAttemptAt: typeof data.next_attempt_at === 'string' ? data.next_attempt_at : null,
        importStatus: typeof data.import_status === 'string' ? data.import_status : null,
      };
    case 'chunk_failed':
      return {
        kind: 'chunk_failed', chunk, retryable: data.retryable !== false,
        errorType: KNOWN_ERRORS.includes(data.error_type) ? data.error_type : 'internal_error',
      };
    default:
      return fail('internal_error');
  }
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

// client: a Supabase client (injected for tests). Resolves to a normalized step; it never throws.
export async function requestImportStep(client, importId, { timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  if (!client) return fail('no_connection');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const { data, error } = await client.functions.invoke(IMPORT_PROCESS_FUNCTION, {
      body: buildImportProcessBody(importId), signal: ctrl.signal,
    });
    if (error) return fail(await errorTypeOf(error, ctrl.signal));
    return normalizeStep(data);
  } catch {
    return fail(ctrl.signal.aborted ? 'timeout' : 'no_connection');
  } finally {
    clearTimeout(timer);
  }
}
