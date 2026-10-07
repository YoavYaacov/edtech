import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanDraft } from './reviewModel';

export const AUTOSAVE_DELAY_MS = 900;
export const RETRY_DELAY_MS = 4000;

// Autosave of ONE candidate's draft (save_candidate_draft). The latest draft always wins: an edit made while a save is in
// flight triggers one more save right after it. status: idle | dirty | saving | saved | error.
//   candidate  the row being edited ({ id, draft, review_status }); changing candidate.id resets the hook
//   save       async (id, draft) => { ok } | throws/returns { error }
//   onSaved    (id, draft) => void   keeps the parent's copy in sync
export function useCandidateDraft({ candidate, save, onSaved, delay = AUTOSAVE_DELAY_MS, retryDelay = RETRY_DELAY_MS }) {
  const id = candidate?.id ?? null;
  const [draft, setDraftState] = useState(candidate?.draft ?? {});
  const [status, setStatus] = useState('idle');
  const latest = useRef(draft);
  const dirty = useRef(false);
  const inflight = useRef(null);
  const timer = useRef(null);
  const idRef = useRef(id);
  const saveRef = useRef(save); saveRef.current = save;
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const run = useCallback(async () => {
    if (inflight.current) return inflight.current;
    clearTimer();
    const p = (async () => {
      let ok = true;
      while (dirty.current && ok) {
        const forId = idRef.current;
        const snapshot = latest.current;
        dirty.current = false;
        setStatus('saving');
        let res;
        try { res = await saveRef.current(forId, cleanDraft(snapshot)); } catch { res = { error: true }; }
        ok = Boolean(res) && !res.error && res.ok !== false;
        if (ok) { onSavedRef.current?.(forId, snapshot); }
        else { dirty.current = true; }
      }
      setStatus(ok ? 'saved' : 'error');
      if (!ok) timer.current = setTimeout(() => { timer.current = null; run(); }, retryDelay);
      return ok;
    })().finally(() => { inflight.current = null; });
    inflight.current = p;
    return p;
  }, [retryDelay]);

  // a different candidate: start clean (the caller flushes the previous one BEFORE switching)
  useEffect(() => {
    idRef.current = id;
    clearTimer();
    latest.current = candidate?.draft ?? {};
    dirty.current = false;
    setDraftState(latest.current);
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setDraft = useCallback((next) => {
    const value = typeof next === 'function' ? next(latest.current) : next;
    latest.current = value;
    dirty.current = true;
    setDraftState(value);
    setStatus('dirty');
    clearTimer();
    timer.current = setTimeout(() => { timer.current = null; run(); }, delay);
  }, [delay, run]);

  // Resolves true when nothing is left unsaved (used before approve / reject / switching).
  const flush = useCallback(async () => {
    clearTimer();
    if (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    return run();
  }, [run]);

  useEffect(() => () => { clearTimer(); if (dirty.current) run(); }, [run]); // leaving the screen: one last best-effort save

  return { draft, setDraft, status, flush };
}
