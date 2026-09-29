import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_REVIEW_FUNCTION, buildAiReviewBody, getCachedAiReview, pickResult, requestAiReview, resetAiReviewMemory, startAiReview,
} from '../aiReviewClient';

const SUB = 'f440050d-b32a-45a8-8bed-5c4d6bd928ef';
const serverResult = {
  proposed_verdict: 'partial', teacher_analysis: 'ניתוח', proposed_student_feedback: 'משוב',
  recommend_return_for_revision: false, return_for_revision_reason: 'סיבה', confidence: 0.99,
  needs_teacher_attention: false, warnings: [],
};
const okBody = { status: 'ok', run_id: 'run-1', result: serverResult };
const clientWith = (impl) => ({ functions: { invoke: vi.fn(impl) } });
const httpError = (status, body) => ({ name: 'FunctionsHttpError', context: { status, json: async () => body } });

beforeEach(() => resetAiReviewMemory());

describe('request contract', () => {
  it('sends ONLY { submission_id } to the ai-review function', async () => {
    const c = clientWith(async () => ({ data: okBody, error: null }));
    await requestAiReview(c, SUB);
    expect(c.functions.invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = c.functions.invoke.mock.calls[0];
    expect(name).toBe('ai-review');
    expect(name).toBe(AI_REVIEW_FUNCTION);
    expect(opts.body).toEqual({ submission_id: SUB });
    expect(Object.keys(opts.body)).toEqual(['submission_id']);
    // nothing else is passed except the abort signal: no headers/token, no key, no context
    expect(Object.keys(opts).sort()).toEqual(['body', 'signal']);
    expect(buildAiReviewBody(SUB)).toEqual({ submission_id: SUB });
  });

  it('drops confidence and keeps only what the UI needs', async () => {
    const r = await requestAiReview(clientWith(async () => ({ data: okBody, error: null })), SUB);
    expect(r.ok).toBe(true);
    expect(r.runId).toBe('run-1');
    expect(JSON.stringify(r)).not.toContain('confidence');
    expect(Object.keys(r.result).sort()).toEqual(
      ['needsAttention', 'proposedStudentFeedback', 'proposedVerdict', 'recommendReturn', 'returnReason', 'teacherAnalysis', 'warnings']);
  });
});

describe('error mapping (never throws, never partial)', () => {
  const cases = [
    ['unauthorized', httpError(401, { status: 'error', error_type: 'unauthorized' })],
    ['forbidden', httpError(403, { status: 'error', error_type: 'forbidden' })],
    ['not_found', httpError(404, { status: 'error', error_type: 'not_found' })],
    ['missing_context', httpError(422, { status: 'error', error_type: 'missing_context' })],
    ['timeout', httpError(504, { status: 'error', error_type: 'timeout' })],
    ['quota_exceeded', httpError(429, { status: 'error', error_type: 'quota_exceeded' })],
    ['server_overload', httpError(503, { status: 'error', error_type: 'server_overload' })],
    ['invalid_output', httpError(502, { status: 'error', error_type: 'invalid_output' })],
    ['internal_error', httpError(500, { status: 'error', error_type: 'internal_error' })],
  ];
  it.each(cases)('%s', async (type, err) => {
    const r = await requestAiReview(clientWith(async () => ({ data: null, error: err })), SUB);
    expect(r).toEqual({ ok: false, errorType: type });
  });

  it('platform 401 (non-JSON body) => unauthorized; network failure => no_connection; unknown 500 => internal_error', async () => {
    const bad = (status) => ({ name: 'FunctionsHttpError', context: { status, json: async () => { throw new Error('html'); } } });
    expect((await requestAiReview(clientWith(async () => ({ data: null, error: bad(401) })), SUB)).errorType).toBe('unauthorized');
    expect((await requestAiReview(clientWith(async () => ({ data: null, error: { name: 'FunctionsFetchError', context: new Error('x') } })), SUB)).errorType).toBe('no_connection');
    expect((await requestAiReview(clientWith(async () => ({ data: null, error: bad(500) })), SUB)).errorType).toBe('internal_error');
    expect((await requestAiReview(clientWith(async () => { throw new TypeError('offline'); }), SUB)).errorType).toBe('no_connection');
    expect((await requestAiReview(null, SUB)).errorType).toBe('no_connection');
  });

  it('a malformed OK body is invalid_output (no partial card)', async () => {
    for (const data of [null, {}, { status: 'ok' }, { status: 'ok', result: { ...serverResult, proposed_verdict: 'great' } },
      { status: 'ok', result: { ...serverResult, warnings: 'x' } }, { status: 'error' }]) {
      const r = await requestAiReview(clientWith(async () => ({ data, error: null })), SUB);
      expect(r).toEqual({ ok: false, errorType: 'invalid_output' });
    }
    expect(pickResult(null)).toBeNull();
  });

  it('client-side timeout never leaves an endless spinner', async () => {
    const hang = (_n, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('aborted'))));
    const r = await requestAiReview(clientWith(hang), SUB, { timeoutMs: 30 });
    expect(r).toEqual({ ok: false, errorType: 'timeout' });
  });
});

describe('one request per submission', () => {
  it('startAiReview de-duplicates concurrent calls and caches success only', async () => {
    let n = 0;
    const c = clientWith(async () => { n += 1; await new Promise((r) => setTimeout(r, 20)); return { data: okBody, error: null }; });
    const [a, b] = [startAiReview(c, SUB), startAiReview(c, SUB)];
    expect(a).toBe(b);
    await a;
    expect(n).toBe(1);
    expect(getCachedAiReview(SUB).ok).toBe(true);

    const failing = clientWith(async () => ({ data: null, error: httpError(503, { error_type: 'server_overload' }) }));
    await startAiReview(failing, 'other');
    expect(getCachedAiReview('other')).toBeNull(); // failures are not cached: retry is possible
  });
});
