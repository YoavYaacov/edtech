// R1B-1 — the browser-paced loop. Pure (no React): every dependency is injected, so it is fully testable.
//
//   done / split      -> next chunk immediately
//   idle + open work  -> wait until next_attempt_at (the server decides the back-off), then continue
//   idle + no work    -> finished (the import is in review / failed)
//   chunk_failed      -> the SERVER already applied attempts + back-off; keep going (the next call says idle/next_attempt_at)
//   budget_exceeded   -> stop with a clear reason (the already-extracted questions are kept)
//   network / timeout -> a few local retries, then stop (nothing is lost: the state lives in the database)
// Processing only runs while the screen is open; closing the tab simply leaves the remaining chunks pending.

export const MAX_WAIT_MS = 60_000;      // one sleep slice (so pause / unmount react quickly)
export const MAX_LOCAL_RETRIES = 3;     // consecutive transport failures before we stop
export const MAX_STEPS = 400;           // hard safety net: 30 pages can never need more

const STOP_ERRORS = new Set(['unauthorized', 'forbidden', 'bad_request', 'not_found', 'server_misconfigured', 'pdf_unreadable']);

// Returns { outcome, ... }:
//   'finished'   { importStatus }      nothing left to do
//   'budget'                           daily quota reached
//   'not_processing' { importStatus }  the import is not (or no longer) processing
//   'stopped'    { errorType }         a non-recoverable error or too many transport failures
//   'paused'                           shouldStop() became true
export async function runImportLoop({ importId, step, sleep, shouldStop = () => false, onEvent = () => {}, now = () => Date.now(), retryDelayMs = 4000 }) {
  let transportFailures = 0;
  for (let i = 0; i < MAX_STEPS; i += 1) {
    if (shouldStop()) return { outcome: 'paused' };
    onEvent({ type: 'calling' });
    const r = await step(importId);
    if (shouldStop()) { onEvent({ type: 'result', result: r }); return { outcome: 'paused' }; }
    onEvent({ type: 'result', result: r });

    if (r.kind === 'done') {
      transportFailures = 0;
      if (r.limitReached) return { outcome: 'finished', importStatus: r.importStatus ?? 'review', limitReached: true };
      if (r.importStatus && r.importStatus !== 'processing') return { outcome: 'finished', importStatus: r.importStatus };
      continue;
    }
    if (r.kind === 'split') { transportFailures = 0; continue; }
    if (r.kind === 'idle') {
      transportFailures = 0;
      if (r.importStatus && r.importStatus !== 'processing') return { outcome: 'finished', importStatus: r.importStatus };
      if (r.openChunks <= 0) return { outcome: 'finished', importStatus: r.importStatus ?? 'review' };
      const wait = r.nextAttemptAt ? Math.max(0, new Date(r.nextAttemptAt).getTime() - now()) : 5000;
      onEvent({ type: 'waiting', ms: wait });
      let left = Math.min(wait + 500, 10 * MAX_WAIT_MS);
      while (left > 0) {
        if (shouldStop()) return { outcome: 'paused' };
        const slice = Math.min(left, MAX_WAIT_MS);
        await sleep(slice);
        left -= slice;
      }
      continue;
    }
    if (r.kind === 'chunk_failed') {
      transportFailures = 0;
      if (r.errorType === 'lease_lost') { await sleep(1500); continue; }
      continue; // the server tracks attempts; it will answer idle with next_attempt_at, or mark the chunk failed
    }
    // r.kind === 'error'
    if (r.errorType === 'budget_exceeded') return { outcome: 'budget' };
    if (r.errorType === 'not_processing') return { outcome: 'not_processing' };
    if (r.errorType === 'lease_lost') { await sleep(1500); continue; }
    if (STOP_ERRORS.has(r.errorType)) return { outcome: 'stopped', errorType: r.errorType };
    transportFailures += 1;
    if (transportFailures > MAX_LOCAL_RETRIES) return { outcome: 'stopped', errorType: r.errorType };
    await sleep(retryDelayMs * transportFailures);
  }
  return { outcome: 'stopped', errorType: 'internal_error' };
}
