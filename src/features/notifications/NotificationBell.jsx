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
export default function NotificationBell({ role, pending, events, loading, error, onRetry, onMarkRead }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  const count = pending.length; // badge = "דורש טיפול" only (decision 76/78); never the unread event count

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellButton}
        onClick={() => setOpen((v) => !v)}
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
          pending={pending}
          events={events}
          loading={loading}
          error={error}
          onRetry={onRetry}
          onNavigate={() => setOpen(false)}
          onMarkRead={onMarkRead}
        />
      )}
    </div>
  );
}
