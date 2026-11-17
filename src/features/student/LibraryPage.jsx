import { Library } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchLibrary } from './studentApi';
import { fetchStudentLessons } from '../lessons/lessonsApi';
import { isLibraryEligible, mainTopics, statusOf } from './learningMap';
import StatusBadge from './StatusBadge';
import { studentLessons as sl, studentMap as m } from '../../i18n/he';
import styles from './student.module.css';

// Lessons (batch 2) are not built yet: the library shows an honest empty state, plus the
// topics that WILL be eligible for lessons (status learning/learned), so it is never a dead page.
export default function LibraryPage() {
  const { user } = useAuth();
  const q = useAsync(() => fetchLibrary(user.id), [user.id]);
  const lq = useAsync(fetchStudentLessons, []);
  const lessonList = lq.data ?? [];
  const lessonsOf = (topicId) => lessonList.filter((l) => l.topics.some((x) => x.topic_id === topicId));
  const titleOf = (id) => q.data?.topics.find((x) => x.id === id)?.title;
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
          {lq.status === 'ready' && lessonList.length === 0 && <EmptyState icon={Library} tone="lavender" title={m.libraryEmptyTitle} body={m.libraryEmptyBody} />}
          {lq.status === 'error' && <ErrorState message={m.loadError} onRetry={lq.reload} />}
          {q.data.subjects.map((s) => ({ s, ls: lessonList.filter((l) => l.course?.id === s.id) })).filter((g) => g.ls.length > 0).map(({ s, ls }) => (
            <section key={s.id} className={styles.panel} style={{ marginBottom: 'var(--space-3)' }}>
              <h2 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--fs-md)' }}>{s.title}</h2>
              <ul className={styles.rows}>
                {ls.map((l) => (
                  <li key={l.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <Link className={`${styles.rowTitle} ${styles.rowLink}`} to={`/student/lessons/${l.id}`}>{l.title}</Link>
                      <span className={styles.rowMeta}>{sl.topicsOf}: {l.topics.map((x) => titleOf(x.topic_id)).filter(Boolean).join(' · ')}</span>
                    </span>
                    <Link to={`/student/lessons/${l.id}`}>{sl.open}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
                      <span className={styles.rowMeta}>{lessonsOf(t.id).length === 0 ? m.libraryNoLessons
                        : lessonsOf(t.id).map((l) => l.title).join(' · ')}</span>
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
