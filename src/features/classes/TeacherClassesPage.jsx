import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAsync } from '../../lib/useAsync';
import { fetchTeacherClasses } from './classesApi';
import TaChangesBanner from './TaChangesBanner';
import IdentityBackupCard from './IdentityBackupCard';
import { classes as ct, errors, teacherClasses as t } from '../../i18n/he';
import styles from '../content/content.module.css';

// All of the teacher's classes in one place; the entry point to each class board.
export default function TeacherClassesPage() {
  const q = useAsync(() => fetchTeacherClasses(), []);
  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <TaChangesBanner />
      <IdentityBackupCard />
      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={errors.generic} onRetry={q.reload} />}
      {q.status === 'ready' && q.data.length === 0 && (
        <EmptyState icon={GraduationCap} title={t.empty} body={t.emptyBody}
          action={<Link to="/teacher/courses">{t.toCourses}</Link>} />
      )}
      {q.status === 'ready' && q.data.length > 0 && (
        <ul className={styles.postList}>
          {q.data.map((c) => (
            <li key={c.id} className={styles.classCard}>
              <div className={styles.classHead}>
                <Link to={`/teacher/classes/${c.id}`} className={styles.className}>{c.title}</Link>
                <span className={styles.muted}>{c.course?.title} · {ct.members(c.members.length)}</span>
              </div>
              <div className={styles.classHead}>
                <Link to={`/teacher/classes/${c.id}`}>{t.board}</Link>
                <Link to={`/teacher/courses/${c.course_id}`} className={styles.muted}>{t.manage}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
