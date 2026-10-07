import { describe, expect, it, vi } from 'vitest';
import { buildImportProcessBody, normalizeStep, requestImportStep } from '../importProcessClient';

const client = (impl) => ({ functions: { invoke: vi.fn(impl) } });
const errOf = (name, body, status) => ({ error: { name, context: { json: async () => body, status } } });

describe('importProcessClient', () => {
  it('sends exactly { import_id } to import-process', async () => {
    const c = client(async () => ({ data: { status: 'idle', open_chunks: 0, next_attempt_at: null, import_status: 'review' }, error: null }));
    await requestImportStep(c, 'imp-1');
    expect(c.functions.invoke.mock.calls[0][0]).toBe('import-process');
    expect(c.functions.invoke.mock.calls[0][1].body).toEqual({ import_id: 'imp-1' });
    expect(buildImportProcessBody('x')).toEqual({ import_id: 'x' });
  });

  it('normalizes done / split / idle / chunk_failed', () => {
    expect(normalizeStep({ status: 'done', chunk: { seq: 2, page_from: 4, page_to: 6, kind: 'standard' }, inserted: 3, dropped: 1, limit_reached: false, warnings: ['possible_missing_questions'], import_status: 'processing', calls_today: 5, daily_ai_calls: 100 }))
      .toEqual({ kind: 'done', chunk: { seq: 2, pageFrom: 4, pageTo: 6, kind: 'standard' }, inserted: 3, dropped: 1, limitReached: false, warnings: ['possible_missing_questions'], importStatus: 'processing', callsToday: 5, dailyCalls: 100 });
    expect(normalizeStep({ status: 'split', reason: 'invalid_output', children: 3 })).toEqual({ kind: 'split', chunk: null, reason: 'invalid_output', children: 3 });
    expect(normalizeStep({ status: 'idle', open_chunks: 2, next_attempt_at: '2026-10-07T10:00:00Z' })).toEqual({ kind: 'idle', openChunks: 2, nextAttemptAt: '2026-10-07T10:00:00Z', importStatus: null });
    expect(normalizeStep({ status: 'chunk_failed', error_type: 'timeout', retryable: true, chunk: { seq: 1, page_from: 1, page_to: 3 } }))
      .toMatchObject({ kind: 'chunk_failed', errorType: 'timeout', retryable: true });
  });

  it('malformed answers become internal_error, never a guess', () => {
    for (const bad of [null, 'x', {}, { status: 'weird' }]) expect(normalizeStep(bad)).toEqual({ kind: 'error', errorType: 'internal_error' });
    expect(normalizeStep({ status: 'chunk_failed', error_type: 'made_up' }).errorType).toBe('internal_error');
  });

  it('maps the server error contract, 401/403, network and client timeout', async () => {
    const t = async (impl) => (await requestImportStep(client(impl), 'i')).errorType;
    expect(await t(async () => errOf('FunctionsHttpError', { error_type: 'budget_exceeded' }))).toBe('budget_exceeded');
    expect(await t(async () => errOf('FunctionsHttpError', { error_type: 'not_processing' }))).toBe('not_processing');
    expect(await t(async () => errOf('FunctionsHttpError', null, 401))).toBe('unauthorized');
    expect(await t(async () => errOf('FunctionsHttpError', null, 403))).toBe('forbidden');
    expect(await t(async () => errOf('FunctionsFetchError', null))).toBe('no_connection');
    expect(await t(async () => { throw new Error('x'); })).toBe('no_connection');
    expect(await requestImportStep(null, 'i')).toEqual({ kind: 'error', errorType: 'no_connection' });
    const slow = client((_n, { signal }) => new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new Error('abort')))));
    expect((await requestImportStep(slow, 'i', { timeoutMs: 20 })).errorType).toBe('timeout');
  });
});
