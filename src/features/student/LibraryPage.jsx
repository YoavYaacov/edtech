import { Library } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchLibrary } from './studentApi';
import { isLibraryEligible, mainTopics, statusOf } from './learningMap';
import StatusBadge from './StatusBadge';
import { studentMap as m } from '../../i18n/he';
import styles from './student.module.css';

// Lessons (batch 2) are not built yet: the library shows an honest empty state, plus the
// topics that WILL be eligible for lessons (status learning/learned), so it is never a dead page.
export default function LibraryPage() {
  const { user } = useAuth();
  const q = useAsync(() => fetchLibrary(user.id), [user.id]);
  const groups = q.status === 'ready'
    ? q.data.subjects.map((s) => ({
      subject: s,
      topics: mainTopics(q.data.topics.filter((t) => t.course_id === s.id))
        .filter((t) => isLibraryEligible(statusOf(q.data.statuses, t.id)))
        .sort((a, b) => a.position - b.position)
        .map((t) => ({ ...t, status: statusOf(q.data.statuses, t.id) })),
    })).filter((g) => g.topics.length > 0)
    : [];
  return (
    <>
      <PageHeader title={m.libraryTitle} subtitle={m.librarySubtitle} />
      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={m.loadError} onRetry={q.reload} />}
      {q.status === 'ready' && (
        <>
          <EmptyState icon={Library} tone="lavender" title={m.libraryEmptyTitle} body={m.libraryEmptyBody} />
          <h2 className={styles.sectionLabel}>{m.libraryReadyTopics}</h2>
          {groups.length === 0 ? <p className={styles.muted}>{m.libraryReadyNone}</p> : groups.map((g) => (
            <section key={g.subject.id} className={styles.panel} style={{ marginBottom: 'var(--space-3)' }}>
              <h3 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--fs-md)' }}>
                <Link to={`/student/subjects/${g.subject.id}`}>{g.subject.title}</Link>
              </h3>
              <ul className={styles.rows}>
                {g.topics.map((t) => (
                  <li key={t.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{t.title}</span>
                      <span className={styles.rowMeta}>{m.libraryNoLessons}</span>
                    </span>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
