import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchMySubjects } from './studentApi';
import { studentHome as h, studentMap as m } from '../../i18n/he';
import styles from './student.module.css';

export default function SubjectsPage() {
  const { user } = useAuth();
  const q = useAsync(() => fetchMySubjects(user.id), [user.id]);
  return (
    <>
      <PageHeader title={m.subjectsTitle} subtitle={m.subjectsSubtitle} />
      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={m.loadError} onRetry={q.reload} />}
      {q.status === 'ready' && q.data.length === 0 && (
        <EmptyState icon={BookOpen} tone="mint" title={h.noSubjectsTitle} body={h.noSubjectsBody} />
      )}
      {q.status === 'ready' && q.data.length > 0 && (
        <ul className={styles.grid}>
          {q.data.map((c) => (
            <li key={c.id}>
              <Link to={`/student/subjects/${c.id}`} className={styles.subjectCard}>
                <span className={styles.subjectIcon}><BookOpen size={24} aria-hidden="true" /></span>
                <span className={styles.subjectName}>{c.title}</span>
                <ChevronLeft size={20} className={styles.chev} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
