import { useCallback, useState } from 'react';

// Session-only open/closed state for collapsible sections (sessionStorage; never DB / localStorage).
// Every access is wrapped: storage can be blocked or throw (private windows, embedded previews).
const PREFIX = 'collapse:';

export function readOpen(key, fallback) {
  try {
    const v = window.sessionStorage.getItem(PREFIX + key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* storage unavailable: use the default */ }
  return fallback;
}

export function writeOpen(key, open) {
  try { window.sessionStorage.setItem(PREFIX + key, open ? '1' : '0'); } catch { /* ignore */ }
}

// storageKey: stable id for the section. defaultOpen: used until the user chooses.
export function useCollapsed(storageKey, defaultOpen) {
  const [open, setOpenState] = useState(() => (storageKey ? readOpen(storageKey, defaultOpen) : defaultOpen));
  const setOpen = useCallback((next) => {
    setOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (storageKey) writeOpen(storageKey, value);
      return value;
    });
  }, [storageKey]);
  return [open, setOpen];
}
