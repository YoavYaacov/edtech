import { useCallback, useEffect, useRef, useState } from 'react';

// Small helper for "load data, show loading/error/ready, allow reload".
// fn must return { data, error } (the Supabase response shape).
export function useAsync(fn, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const requestId = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const { data, error } = await run();
      if (id !== requestId.current) return; // a newer request won
      setState(error
        ? { status: 'error', data: null, error }
        : { status: 'ready', data, error: null });
    } catch (error) {
      if (id === requestId.current) setState({ status: 'error', data: null, error });
    }
  }, [run]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
