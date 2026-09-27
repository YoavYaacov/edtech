import { Link } from 'react-router-dom';
import { X, Clock, RotateCcw, Send, CheckCircle2 } from 'lucide-react';
import { deepLinkFor } from './notificationsApi';
import { formatRelativeDay, notifications as t } from '../../i18n/he';
import styles from './notifications.module.css';

// Two areas, never merged (decision 76):
//   * "דורש טיפול" (pending) — derived; closes itself, no read/unread state
//     of its own — but CAN carry an "unread" hint borrowed from a stored
//     event that describes the same fact (decision 86, see notificationsApi
//     reconcile()); clicking it then clears that borrowed event too.
//   * "חדש" (events) — Stored Events; unread ones get a dot here, but never
//     affect the bell's own number, and never repeat something already
//     shown under "דורש טיפול" (that duplicate was already filtered out
//     upstream, in notificationsApi.reconcile()).
export default function NotificationPanel({ role, pending, events, loading, error, onRetry, onNavigate, onClose, onMarkRead }) {
  return (
    <div className={styles.panel} role="dialog" aria-label={t.panelTitle}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelHeaderTitle}>{t.panelTitle}</h2>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t.close}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.panelBody}>
        {loading && <p className={styles.muted}>{t.loading}</p>}
        {error && (
          <p className={styles.error}>
            {t.loadError}{' '}
            <button type="button" className={styles.linkBtn} onClick={onRetry}>{t.retry}</button>
          </p>
        )}
        {!loading && !error && (
          <>
            <section aria-labelledby="notif-pending">
              <h3 id="notif-pending" className={styles.sectionTitle}>{t.pendingSection}</h3>
              {pending.length === 0 ? (
                <p className={styles.empty}>{t.pendingEmpty}</p>
              ) : (
                <ul className={styles.list}>
                  {pending.map((row) => {
                    const Icon = role === 'teacher' ? Clock : RotateCcw;
                    return (
                      <li key={row.key}>
                        <RowLink
                          href={deepLinkFor(role, row)}
                          className={`${styles.item} ${row.unread ? styles.unread : ''}`}
                          onClick={() => {
                            if (row.unread) onMarkRead(row.absorbedEventIds);
                            onNavigate();
                          }}
                        >
                          {row.unread && <span className={styles.unreadDot} aria-hidden="true" />}
                          <Icon size={16} className={styles.itemIcon} aria-hidden="true" />
                          <span className={styles.itemText}>
                            <span className={styles.itemTitle}>
                              {role === 'teacher'
                                ? t.pendingTeacherTitle(row.assignmentTitle, row.studentName)
                                : t.pendingStudent(row.questionTitle)}
                            </span>
                            <span className={styles.itemMeta}>
                              {role === 'teacher'
                                ? `${t.pendingCount(row.pendingCount)}${row.courseTitle ? ` · ${row.courseTitle}` : ''}`
                                : metaLine(row)}
                            </span>
                          </span>
                          {row.unread && <span className="visually-hidden">{t.unread}</span>}
                        </RowLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="notif-new">
              <h3 id="notif-new" className={styles.sectionTitle}>{t.newSection}</h3>
              {events.length === 0 ? (
                <p className={styles.empty}>{t.newEmpty}</p>
              ) : (
                <ul className={styles.list}>
                  {events.map((row) => {
                    const unread = !row.read_at;
                    const Icon = eventIcon(row.event_type);
                    return (
                      <li key={row.id}>
                        <RowLink
                          href={deepLinkFor(role, row)}
                          className={`${styles.item} ${unread ? styles.unread : ''}`}
                          onClick={() => { if (unread) onMarkRead(row.id); onNavigate(); }}
                        >
                          {unread && <span className={styles.unreadDot} aria-hidden="true" />}
                          <Icon size={16} className={styles.itemIcon} aria-hidden="true" />
                          <span className={styles.itemText}>
                            <span className={styles.itemTitle}>{eventTitle(row)}</span>
                            <span className={styles.itemMeta}>{metaLine(row)} · {formatRelativeDay(row.created_at)}</span>
                          </span>
                          {unread && <span className="visually-hidden">{t.unread}</span>}
                        </RowLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// href can be null if a row's position/assignment couldn't be resolved
// (e.g. a race with a delete) — degrade to plain (non-navigating) text
// rather than passing a bad `to` to <Link>.
function RowLink({ href, className, onClick, children }) {
  return href
    ? <Link to={href} className={className} onClick={onClick}>{children}</Link>
    : <div className={className}>{children}</div>;
}

function metaLine(row) {
  return row.courseTitle ? `${row.assignmentTitle} · ${row.courseTitle}` : row.assignmentTitle;
}

function eventTitle(row) {
  if (row.event_type === 'submission_received') return t.eventSubmissionReceived(row.studentName, row.questionTitle);
  if (row.event_type === 'feedback_available') return t.eventFeedbackAvailable(row.questionTitle);
  return t.eventReturnedForRevision(row.questionTitle);
}

function eventIcon(eventType) {
  if (eventType === 'submission_received') return Send;
  if (eventType === 'feedback_available') return CheckCircle2;
  return RotateCcw;
}
