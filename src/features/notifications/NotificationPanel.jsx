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
//
// Notification Center principle (this round): this panel is an Action
// Center, not an Event Log — every row's title is "what assignment / who",
// its meta line is "what happened", and neither ever names a question.
// Teacher unit stays Student × Assignment (unchanged, already accepted);
// student unit is now the Assignment alone, on both sides of the panel.
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
                    const isCorrection = role === 'teacher' && row.correctionCount > 0;
                    const Icon = role === 'teacher' ? (isCorrection ? RotateCcw : Clock) : RotateCcw;
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
                              {role === 'teacher' ? t.pendingTeacherTitle(row.assignmentTitle, row.studentName) : row.assignmentTitle}
                            </span>
                            <span className={styles.itemMeta}>
                              {role === 'teacher'
                                ? `${pendingCountText(row)}${row.courseTitle ? ` · ${row.courseTitle}` : ''}`
                                : t.pendingStudentStatus}
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
                          onClick={() => { if (unread) onMarkRead(row.memberIds ?? row.id); onNavigate(); }}
                        >
                          {unread && <span className={styles.unreadDot} aria-hidden="true" />}
                          <Icon size={16} className={styles.itemIcon} aria-hidden="true" />
                          <span className={styles.itemText}>
                            <span className={styles.itemTitle}>{eventTitle(role, row)}</span>
                            <span className={styles.itemMeta}>{eventMeta(row)} · {formatRelativeDay(row.created_at)}</span>
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

// Teacher "דורש טיפול" meta line — plain pending count, unless the whole
// group is resubmissions (a correction after a return), which gets its own
// wording so it reads as the distinct, notable case it is (decision 5).
function pendingCountText(row) {
  if (row.correctionCount > 0 && row.correctionCount === row.pendingCount) return t.correctionCount(row.correctionCount);
  return t.pendingCount(row.pendingCount);
}

// A rare unmatched leftover event's title/meta — never a question name
// (Notification Center principle). A teacher's own leftover shows who
// submitted; a student's shows the assignment (the merged feedback_available
// row never reaches this path — it's titled by row.assignmentTitle above).
function eventTitle(role, row) {
  if (role === 'student') return row.assignmentTitle;
  return t.eventSubmissionReceived(row.studentName);
}
function eventMeta(row) {
  // teacher's rare leftover: the title already names the student, so the
  // meta line's job is to say which assignment (mirrors metaLine's old role).
  if (row.event_type === 'submission_received') return row.courseTitle ? `${row.assignmentTitle} · ${row.courseTitle}` : row.assignmentTitle;
  // student rows: the title is already the assignment, so the meta line's
  // job is to say what happened.
  const status = row.event_type === 'feedback_available' ? t.eventFeedbackAvailable : t.eventReturnedForRevision;
  return row.courseTitle ? `${status} · ${row.courseTitle}` : status;
}

function eventIcon(eventType) {
  if (eventType === 'submission_received') return Send;
  if (eventType === 'feedback_available') return CheckCircle2;
  return RotateCcw;
}
