import { Link } from 'react-router-dom';
import { X, Clock, RotateCcw, CheckCircle2 } from 'lucide-react';
import { deepLinkFor } from './notificationsApi';
import { notifications as t } from '../../i18n/he';
import styles from './notifications.module.css';

// Round 6: ONE unified list — an Action Center, not an Event Log. Every row
// here is, by construction, something currently relevant to the user right
// now (see notificationsApi for the "דורש טיפול"/"חדש" split this replaces
// and why). Teacher unit stays Student × Assignment (unchanged, already
// accepted); student unit is the Assignment, whether the row is the
// actionable "↻ הוחזרה לתיקון" or the informational "✓ התקבל משוב חדש" —
// neither ever names a question.
export default function NotificationPanel({ role, items, loading, error, onRetry, onNavigate, onClose, onMarkRead }) {
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
          items.length === 0 ? (
            <p className={styles.empty}>{t.pendingEmpty}</p>
          ) : (
            <ul className={styles.list}>
              {items.map((row) => {
                const isCorrection = row.kind === 'teacher_pending' && row.correctionCount > 0;
                const Icon = row.kind === 'student_feedback' ? CheckCircle2
                  : row.kind === 'teacher_pending' ? (isCorrection ? RotateCcw : Clock)
                    : RotateCcw;
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
                          {row.kind === 'teacher_pending' ? t.pendingTeacherTitle(row.assignmentTitle, row.studentName) : row.assignmentTitle}
                        </span>
                        <span className={styles.itemMeta}>
                          {row.kind === 'teacher_pending'
                            ? `${pendingCountText(row)}${row.courseTitle ? ` · ${row.courseTitle}` : ''}`
                            : row.kind === 'student_returned'
                              ? t.pendingStudentStatus
                              : `${t.eventFeedbackAvailable}${row.courseTitle ? ` · ${row.courseTitle}` : ''}`}
                        </span>
                      </span>
                      {row.unread && <span className="visually-hidden">{t.unread}</span>}
                    </RowLink>
                  </li>
                );
              })}
            </ul>
          )
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

// Teacher meta line — plain pending count, unless the whole group is
// resubmissions (a correction after a return), which gets its own wording
// so it reads as the distinct, notable case it is.
function pendingCountText(row) {
  if (row.correctionCount > 0 && row.correctionCount === row.pendingCount) return t.correctionCount(row.correctionCount);
  return t.pendingCount(row.pendingCount);
}
