import { useCallback, useEffect, useRef, useState } from 'react';

// Reliable autosave:
//  * one debounced save after typing stops (no request per keystroke)
//  * never two saves in flight; changes made during a save are saved next
//  * automatic retry after a failure (text stays on screen)
//  * flush() saves now (question switch, submit, tab hidden)
//  * browser warning when leaving with unsaved text
// status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export function useAutosave({ value, serverValue, save, onSaved, delay = 1200, retryDelay = 4000, enabled = true }) {
  const [status, setStatus] = useState(value === serverValue ? 'idle' : 'dirty');
  const [savedAt, setSavedAt] = useState(null);
  const latest = useRef(value);
  const confirmed = useRef(serverValue);
  const inFlight = useRef(null);
  const timer = useRef(null);
  const mounted = useRef(true);
  const saveRef = useRef(save);
  const onSavedRef = useRef(onSaved);
  latest.current = value;
  saveRef.current = save;
  onSavedRef.current = onSaved;

  const set = (s) => { if (mounted.current) setStatus(s); };

  const runSave = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const v = latest.current;
    if (v === confirmed.current) return true;
    set('saving');
    const job = (async () => {
      try {
        const { data, error } = await saveRef.current(v);
        // "נשמר" only after the server confirmed the save (a missing timestamp is a failure).
        if (error || data == null) throw error ?? new Error('save not confirmed');
        confirmed.current = v;
        onSavedRef.current?.(v, data);
        if (mounted.current) setSavedAt(data ?? new Date().toISOString());
        return true;
      } catch {
        set('error');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { runSave(); }, retryDelay);
        return false;
      }
    })();
    inFlight.current = job;
    const ok = await job;
    inFlight.current = null;
    if (ok) {
      if (latest.current !== confirmed.current) {
        set('dirty');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { runSave(); }, delay);
      } else {
        set('saved');
      }
    }
    return ok;
  }, [delay, retryDelay]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    return runSave();
  }, [runSave]);

  // debounce on every change
  useEffect(() => {
    if (!enabled || value === confirmed.current) return undefined;
    set('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { runSave(); }, delay);
    return undefined;
  }, [value, enabled, delay, runSave]);

  // save when the tab is hidden; warn before leaving with unsaved text
  useEffect(() => {
    if (!enabled) return undefined;
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const onLeave = (e) => {
      if (latest.current !== confirmed.current) { e.preventDefault(); e.returnValue = ''; }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [enabled, flush]);

  // on unmount (e.g. moving to another question): save what is pending
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      if (enabled && latest.current !== confirmed.current) runSave();
    };
  }, [enabled, runSave]);

  return { status, savedAt, flush };
}
