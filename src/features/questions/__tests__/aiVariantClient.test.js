import { describe, expect, it, vi } from 'vitest';
import { buildAiVariantBody, pickProposal, requestAiVariant } from '../aiVariantClient';

const good = { target_language: 'csharp', body_md: 'b', starter_code: 's', solution_code: 'x', explanation_md: 'e', hints: [{ level: 2, content_md: 'h2' }, { level: 1, content_md: 'h1' }], warnings: ['w'], confidence: 0.7 };
const client = (impl) => ({ functions: { invoke: vi.fn(impl) } });
const errOf = (name, body, status) => ({ error: { name, context: { json: async () => body, status } } });

describe('aiVariantClient', () => {
  it('sends exactly { question_id, target_language } to ai-variant', async () => {
    const c = client(async () => ({ data: { status: 'ok', run_id: 'r', source_language: 'java', result: good }, error: null }));
    const r = await requestAiVariant(c, 'q1', 'csharp');
    expect(c.functions.invoke.mock.calls[0][0]).toBe('ai-variant');
    expect(c.functions.invoke.mock.calls[0][1].body).toEqual({ question_id: 'q1', target_language: 'csharp' });
    expect(buildAiVariantBody('q', 'python')).toEqual({ question_id: 'q', target_language: 'python' });
    expect(r.ok).toBe(true);
    expect(r.runId).toBe('r');
    expect(r.proposal.hints.map((h) => h.level)).toEqual([1, 2]);
  });
  it('malformed or mismatching result => invalid_output, never a partial proposal', async () => {
    for (const result of [null, { ...good, hints: 'x' }, { ...good, body_md: 1 }, { ...good, target_language: 'python' }]) {
      const r = await requestAiVariant(client(async () => ({ data: { status: 'ok', result }, error: null })), 'q', 'csharp');
      expect(r).toEqual({ ok: false, errorType: 'invalid_output' });
    }
    expect(pickProposal({ ...good, warnings: [1] })).toBeNull();
  });
  it('maps server error contract, 401/403, network, and client timeout', async () => {
    expect(await requestAiVariant(client(async () => errOf('FunctionsHttpError', { error_type: 'quota_exceeded' })), 'q', 'csharp')).toEqual({ ok: false, errorType: 'quota_exceeded' });
    expect(await requestAiVariant(client(async () => errOf('FunctionsHttpError', null, 401)), 'q', 'csharp')).toEqual({ ok: false, errorType: 'unauthorized' });
    expect(await requestAiVariant(client(async () => errOf('FunctionsFetchError', null)), 'q', 'csharp')).toEqual({ ok: false, errorType: 'no_connection' });
    expect(await requestAiVariant(client(async () => { throw new Error('x'); }), 'q', 'csharp')).toEqual({ ok: false, errorType: 'no_connection' });
    const hang = client((_n, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('abort')))));
    expect(await requestAiVariant(hang, 'q', 'csharp', { timeoutMs: 10 })).toEqual({ ok: false, errorType: 'timeout' });
    expect(await requestAiVariant(null, 'q', 'csharp')).toEqual({ ok: false, errorType: 'no_connection' });
  });
  it('no secret or key reference in the client source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/features/questions/aiVariantClient.js', 'utf8');
    expect(src).not.toMatch(/GEMINI|API_KEY|VITE_|x-goog|service_role/i);
  });
});
