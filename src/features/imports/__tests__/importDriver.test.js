import { describe, expect, it, vi } from 'vitest';
import { MAX_LOCAL_RETRIES, runImportLoop } from '../importDriver';

const seq = (...results) => { const q = [...results]; return vi.fn(async () => q.shift() ?? { kind: 'idle', openChunks: 0, nextAttemptAt: null, importStatus: 'review' }); };
const base = (step, extra = {}) => ({ importId: 'i', step, sleep: vi.fn(async () => {}), now: () => 0, retryDelayMs: 1, ...extra });
const done = (importStatus = 'processing', extra = {}) => ({ kind: 'done', inserted: 1, dropped: 0, limitReached: false, warnings: [], importStatus, ...extra });

describe('runImportLoop', () => {
  it('done and split continue immediately; finishes when the import leaves processing', async () => {
    const step = seq(done(), { kind: 'split', reason: 'x', children: 3 }, done(), done('review'));
    const out = await runImportLoop(base(step));
    expect(out).toEqual({ outcome: 'finished', importStatus: 'review' });
    expect(step).toHaveBeenCalledTimes(4);
  });

  it('idle with open work waits until next_attempt_at, then continues', async () => {
    const step = seq({ kind: 'idle', openChunks: 1, nextAttemptAt: '1970-01-01T00:00:30.000Z', importStatus: null }, done('review'));
    const o = base(step);
    const out = await runImportLoop(o);
    expect(out.outcome).toBe('finished');
    expect(o.sleep).toHaveBeenCalledWith(30_500);
  });

  it('idle with nothing open finishes', async () => {
    expect(await runImportLoop(base(seq({ kind: 'idle', openChunks: 0, nextAttemptAt: null, importStatus: null })))).toMatchObject({ outcome: 'finished' });
  });

  it('chunk_failed keeps going (the server owns attempts and back-off)', async () => {
    const step = seq({ kind: 'chunk_failed', errorType: 'timeout', retryable: true }, { kind: 'idle', openChunks: 1, nextAttemptAt: null, importStatus: null }, done('review'));
    expect((await runImportLoop(base(step))).outcome).toBe('finished');
  });

  it('budget_exceeded and not_processing stop with their own outcome', async () => {
    expect((await runImportLoop(base(seq({ kind: 'error', errorType: 'budget_exceeded' })))).outcome).toBe('budget');
    expect((await runImportLoop(base(seq({ kind: 'error', errorType: 'not_processing' })))).outcome).toBe('not_processing');
  });

  it('non-recoverable errors stop at once; transport errors retry a few times and then stop', async () => {
    const s1 = seq({ kind: 'error', errorType: 'forbidden' });
    expect(await runImportLoop(base(s1))).toEqual({ outcome: 'stopped', errorType: 'forbidden' });
    expect(s1).toHaveBeenCalledTimes(1);
    const s2 = vi.fn(async () => ({ kind: 'error', errorType: 'no_connection' }));
    const out = await runImportLoop(base(s2));
    expect(out).toEqual({ outcome: 'stopped', errorType: 'no_connection' });
    expect(s2).toHaveBeenCalledTimes(MAX_LOCAL_RETRIES + 1);
  });

  it('a transient error followed by success keeps going', async () => {
    const step = seq({ kind: 'error', errorType: 'timeout' }, done('review'));
    expect((await runImportLoop(base(step))).outcome).toBe('finished');
  });

  it('pausing stops before the next call and never loses the in-flight answer', async () => {
    let stop = false;
    const step = vi.fn(async () => { stop = true; return done(); });
    const events = [];
    const out = await runImportLoop(base(step, { shouldStop: () => stop, onEvent: (e) => events.push(e.type) }));
    expect(out.outcome).toBe('paused');
    expect(step).toHaveBeenCalledTimes(1);
    expect(events).toContain('result');
  });

  it('request body is only the import id', async () => {
    const step = seq(done('review'));
    await runImportLoop(base(step));
    expect(step).toHaveBeenCalledWith('i');
  });
});
