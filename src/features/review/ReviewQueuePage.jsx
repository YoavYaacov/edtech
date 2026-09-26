import { Link } from 'react-router-dom';
import { ClipboardCheck, ChevronLeft } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { fetchReviewQueue } from './reviewApi';
import { useAsync } from '../../lib/useAsync';
import { errors, formatRelativeDay, reviewQueue as t } from '../../i18n/he';
import styles from './review.module.css';

// Central review queue (UX fix 2, decision 72): one row per student × assignment.
// Built on the existing teacher_review_queue view; no course/assignment/student
// selection is needed to start working.
export default function ReviewQueuePage() {
  const q = useAsync(() => fetchReviewQueue(), []);
  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={errors.generic} onRetry={q.reload} />}
      {q.status === 'ready' && q.data.length === 0 && (
        <EmptyState icon={ClipboardCheck} tone="mint" title={t.emptyTitle} body={t.emptyBody} />
      )}
      {q.status === 'ready' && q.data.length > 0 && (
        <ul className={styles.queue}>
          {q.data.map((r) => (
            <li key={`${r.assignmentId}:${r.studentId}`} className={styles.queueRow}>
              <div className={styles.queueText}>
                <span className={styles.queueStudent}>{r.studentName}</span>
                <span className={styles.queueTitle}>{r.title}</span>
                <span className={styles.muted}>
                  {r.courseTitle} · {t.submitted(formatRelativeDay(r.oldest))} · {t.pendingOf(r.pending, r.total)}
                </span>
              </div>
              <span className={styles.queueMeta}>
                {r.drafts > 0 && <Badge tone="lavender">{t.drafts(r.drafts)}</Badge>}
                {r.status === 'closed' && <Badge>{t.closed}</Badge>}
              </span>
              <Link className={styles.queueBtn}
                to={`/teacher/assignments/${r.assignmentId}/review?student=${r.studentId}&q=${r.firstPendingIndex + 1}`}>
                {t.open}<ChevronLeft size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
