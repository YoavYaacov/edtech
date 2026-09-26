import { Link } from 'react-router-dom';
import { deepLinkFor } from './notificationsApi';
import { formatRelativeDay, notifications as t } from '../../i18n/he';
import styles from './notifications.module.css';

// Two areas, never merged (decision 76):
//   * "דורש טיפול" (pending) — derived; closes itself, no read/unread state.
//   * "חדש" (events)         — Stored Events; unread ones get a dot here,
//                               but never affect the bell's own number.
export default function NotificationPanel({ role, pending, events, loading, error, onRetry, onNavigate, onMarkRead }) {
  return (
    <div className={styles.panel} role="dialog" aria-label={t.panelTitle}>
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
                {pending.map((row) => (
                  <li key={`${row.assignment_question_id}:${row.student_id ?? 'self'}`}>
                    <RowLink href={deepLinkFor(role, row)} className={styles.item} onClick={onNavigate}>
                      <span className={styles.itemTitle}>
                        {role === 'teacher' ? t.pendingTeacher(row.studentName, row.questionTitle) : t.pendingStudent(row.questionTitle)}
                      </span>
                      <span className={styles.itemMeta}>{metaLine(row)}</span>
                    </RowLink>
                  </li>
                ))}
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
                  return (
                    <li key={row.id}>
                      <RowLink
                        href={deepLinkFor(role, row)}
                        className={`${styles.item} ${unread ? styles.unread : ''}`}
                        onClick={() => { if (unread) onMarkRead(row.id); onNavigate(); }}
                      >
                        {unread && <span className={styles.unreadDot} aria-hidden="true" />}
                        <span className={styles.itemTitle}>{eventTitle(row)}</span>
                        <span className={styles.itemMeta}>{metaLine(row)} · {formatRelativeDay(row.created_at)}</span>
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
