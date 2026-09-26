import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { fetchNotificationCenter, markNotificationRead } from './notificationsApi';

// Refresh policy approved for Phase 5 step 2: no Realtime, no fixed-interval
// polling. Re-fetches on mount (useAsync's own effect), on tab/window focus,
// and after internal navigation. "Relevant navigation" is read here as any
// route change (via location.key) rather than an allow-list of routes —
// narrowing it further would mean guessing which pages matter and risks
// silently missing one.
//
// Called ONCE from AppShell (not from inside NotificationBell) because
// AppShell always renders both the desktop sidebar and the mobile topbar —
// only one is hidden with CSS per viewport, the other still mounts — so a
// bell that fetched its own data would issue every request twice.
export function useNotificationCenter(role) {
  const location = useLocation();
  const q = useAsync(() => fetchNotificationCenter(role), [role]);
  const mountedAt = useRef(location.key);

  useEffect(() => {
    if (location.key === mountedAt.current) return; // mount is already covered by useAsync itself
    q.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    function onFocus() { q.reload(); }
    function onVisible() { if (document.visibilityState === 'visible') q.reload(); }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(id) {
    await markNotificationRead(id);
    q.reload();
  }

  return {
    pending: q.data?.pending ?? [],
    events: q.data?.events ?? [],
    loading: q.status === 'loading',
    error: q.status === 'error',
    reload: q.reload,
    markRead,
  };
}
