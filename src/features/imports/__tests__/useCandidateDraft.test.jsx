import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCandidateDraft } from '../useCandidateDraft';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const cand = (id = 'c1', draft = { title: 'a' }) => ({ id, draft, review_status: 'pending' });
const setup = (save, candidate = cand(), onSaved = vi.fn()) => renderHook(({ c }) => useCandidateDraft({ candidate: c, save, onSaved, delay: 100, retryDelay: 500 }), { initialProps: { c: candidate } });
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('useCandidateDraft', () => {
  it('debounces edits into ONE save of the latest draft, then reports saved', async () => {
    const save = vi.fn(async () => ({ ok: true })); const onSaved = vi.fn();
    const { result } = setup(save, cand(), onSaved);
    act(() => result.current.setDraft({ title: 'b' }));
    act(() => result.current.setDraft({ title: 'bc' }));
    expect(result.current.status).toBe('dirty');
    await tick(150);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('c1', { title: 'bc' });
    expect(result.current.status).toBe('saved');
    expect(onSaved).toHaveBeenCalledWith('c1', { title: 'bc' });
  });

  it('an edit made while a save is in flight is saved right after (latest always wins)', async () => {
    let release; const calls = [];
    const save = vi.fn((id, d) => { calls.push(d.title); return new Promise((r) => { release = () => r({ ok: true }); }); });
    const { result } = setup(save);
    act(() => result.current.setDraft({ title: 'one' }));
    await tick(150);
    act(() => result.current.setDraft({ title: 'two' }));
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(10); });
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(10); });
    expect(calls).toEqual(['one', 'two']);
    expect(result.current.status).toBe('saved');
  });

  it('a failed save shows error and retries by itself', async () => {
    const save = vi.fn().mockResolvedValueOnce({ error: true }).mockResolvedValue({ ok: true });
    const { result } = setup(save);
    act(() => result.current.setDraft({ title: 'x' }));
    await tick(150);
    expect(result.current.status).toBe('error');
    await tick(600);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('flush saves immediately and resolves true; resolves false when the save fails', async () => {
    const save = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValue({ error: true });
    const { result } = setup(save);
    act(() => result.current.setDraft({ title: 'x' }));
    let ok; await act(async () => { ok = await result.current.flush(); });
    expect(ok).toBe(true); expect(save).toHaveBeenCalledTimes(1);
    act(() => result.current.setDraft({ title: 'y' }));
    await act(async () => { ok = await result.current.flush(); });
    expect(ok).toBe(false);
  });

  it('sends only whitelisted keys', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const { result } = setup(save);
    act(() => result.current.setDraft({ title: 'x', owner_id: 'evil' }));
    await tick(150);
    expect(save).toHaveBeenCalledWith('c1', { title: 'x' });
  });

  it('switching candidate resets the draft and never saves the old one into the new', async () => {
    const save = vi.fn(async () => ({ ok: true }));
    const { result, rerender } = setup(save);
    rerender({ c: cand('c2', { title: 'other' }) });
    expect(result.current.draft).toEqual({ title: 'other' });
    expect(result.current.status).toBe('idle');
    await tick(500);
    expect(save).not.toHaveBeenCalled();
  });
});
