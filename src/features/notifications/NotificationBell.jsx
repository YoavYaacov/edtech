import { useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useClickOutside } from '../../lib/useClickOutside';
import { notifications as t } from '../../i18n/he';
import NotificationPanel from './NotificationPanel';
import styles from './notifications.module.css';

// Presentational only — data + refresh policy live in useNotificationCenter,
// called once by AppShell, because AppShell mounts this bell twice (desktop
// sidebar + mobile topbar; the inactive one is CSS-hidden, not unmounted).
// Each mount keeps its own open/closed state, which is what we want: opening
// the bell in one layout should not affect the other.
export default function NotificationBell({ role, items, loading, error, onRetry, onMarkRead }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  // Round 6: badge = the unified list's own length — every row shown is
  // "currently relevant" by the list's own definition, so this is also the
  // count of dots that can be showing (see notificationsApi for the full
  // reasoning and the bug this replaces).
  const count = items.length;

  // Bug-fix round (decision 87): opening the panel always forces a fresh
  // fetch, on top of the existing mount/focus/navigation refresh policy.
  // This closes a real staleness gap — a cross-user event (e.g. a teacher's
  // feedback release) has no way to reach an already-open student tab
  // without one of those three triggers firing on the student's own side.
  // It's still not polling/Realtime (decision 83): it fires only on this
  // explicit user action, exactly the kind of "own action that should
  // refresh the UI" case decision 83 already allows for.
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onRetry();
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellButton}
        onClick={toggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count > 0 ? t.bellWithCount(count) : t.bell}
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && <span className={styles.badge} aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <NotificationPanel
          role={role}
          items={items}
          loading={loading}
          error={error}
          onRetry={onRetry}
          onNavigate={() => setOpen(false)}
          onClose={() => setOpen(false)}
          onMarkRead={onMarkRead}
        />
      )}
    </div>
  );
}
