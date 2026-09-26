import { useEffect } from 'react';

// Closes a popover on a pointerdown outside `ref.current`, or on Escape.
// Used by the notification panel (Phase 5 step 2), which is an anchored
// popover, not a native <dialog> — the project has no such helper yet.
export function useClickOutside(ref, onOutside, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handlePointer(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    }
    function handleKey(e) {
      if (e.key === 'Escape') onOutside();
    }
    document.addEventListener('pointerdown', handlePointer, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ref, onOutside, enabled]);
}
