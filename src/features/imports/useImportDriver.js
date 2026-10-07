import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { requestImportStep } from './importProcessClient';
import { runImportLoop } from './importDriver';

const defaultStep = (id) => requestImportStep(supabase, id);
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// React wrapper over runImportLoop. phase: idle | running | waiting | paused | finished | budget | stopped | not_processing
// onProgress() is called after every server answer so the screen can refresh its numbers.
export function useImportDriver(importId, { onProgress, step = defaultStep, sleep = defaultSleep } = {}) {
  const [phase, setPhase] = useState('idle');
  const [waitMs, setWaitMs] = useState(0);
  const [error, setError] = useState(null);
  const [lastWarning, setLastWarning] = useState(null);
  const token = useRef(0);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const start = useCallback(async () => {
    const mine = ++token.current;
    const stale = () => token.current !== mine;
    setPhase('running'); setError(null);
    const out = await runImportLoop({
      importId, step, sleep, shouldStop: stale,
      onEvent: (e) => {
        if (stale()) return;
        if (e.type === 'calling') { setPhase('running'); setWaitMs(0); }
        if (e.type === 'waiting') { setPhase('waiting'); setWaitMs(e.ms); }
        if (e.type === 'result') { setLastWarning(e.result?.kind === 'chunk_failed' ? e.result.errorType : null); progressRef.current?.(e.result); }
      },
    });
    if (stale()) return;
    setWaitMs(0);
    if (out.outcome === 'finished') setPhase('finished');
    else if (out.outcome === 'budget') setPhase('budget');
    else if (out.outcome === 'not_processing') setPhase('not_processing');
    else if (out.outcome === 'stopped') { setError(out.errorType ?? 'internal_error'); setPhase('stopped'); }
    else setPhase('paused');
    progressRef.current?.(null);
  }, [importId, step, sleep]);

  const pause = useCallback(() => { token.current += 1; setPhase('paused'); setWaitMs(0); }, []);
  useEffect(() => () => { token.current += 1; }, []); // leaving the screen stops the loop; the database keeps the state

  return { phase, waitMs, error, lastWarning, start, pause };
}
