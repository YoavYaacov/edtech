import { Link } from 'react-router-dom';
import { FileQuestion, Library, Users, UserPlus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchMyStudents } from '../students/studentsApi';
import { fetchCourses } from '../content/contentApi';
import TaChangesBanner from '../classes/TaChangesBanner';
import { fetchActiveQuestionCount } from '../questions/questionsApi';
import { common, errors, teacherHome as t } from '../../i18n/he';
import styles from './dashboard.module.css';

export default function TeacherHomePage() {
  const { user, profile } = useAuth();
  const { status, data, reload } = useAsync(() => fetchMyStudents(user.id), [user.id]);
  const active = data?.filter((r) => r.status === 'active') ?? [];
  const coursesQ = useAsync(() => fetchCourses(), []);
  const countQ = useAsync(() => fetchActiveQuestionCount(), []);
  const activeCourses = coursesQ.data?.filter((c) => !c.is_archived) ?? [];

  return (
    <>
      <PageHeader title={common.hello(profile.full_name)} />
      <TaChangesBanner />
      {status === 'loading' && <LoadingState />}
      {status === 'error' && <ErrorState message={errors.generic} onRetry={reload} />}
      {status === 'ready' && active.length === 0 && (
        <EmptyState icon={UserPlus} title={t.noStudentsTitle} body={t.noStudentsBody}
          action={<Link to="/teacher/students" className={styles.linkButton}>{t.inviteFirst}</Link>} />
      )}
      {status === 'ready' && active.length > 0 && (
        <section className={styles.tile} data-tone="sky" aria-labelledby="students-tile">
          <span className={styles.tileIcon}><Users size={22} aria-hidden="true" /></span>
          <div className={styles.tileBody}>
            <h2 id="students-tile" className={styles.tileTitle}>{t.studentsCard}</h2>
            <p className={styles.tileValue}>{t.studentsCount(active.length)}</p>
            <p className={styles.names}>{active.map((r) => r.student.full_name).join(', ')}</p>
          </div>
          <Link to="/teacher/students" className={styles.tileLink}>{t.manageStudents}</Link>
        </section>
      )}
      <div className={styles.tiles}>
        {coursesQ.status === 'ready' && (
          <Link to="/teacher/courses" className={styles.miniTile} data-tone="lavender">
            <Library size={20} aria-hidden="true" />
            <span className={styles.tileTitle}>{t.coursesCard}</span>
            <span className={styles.miniValue}>{t.coursesCount(activeCourses.length)}</span>
          </Link>
        )}
        {countQ.status === 'ready' && (
          <Link to="/teacher/questions" className={styles.miniTile} data-tone="mint">
            <FileQuestion size={20} aria-hidden="true" />
            <span className={styles.tileTitle}>{t.questionsCard}</span>
            <span className={styles.miniValue}>{t.questionsCount(countQ.data)}</span>
          </Link>
        )}
      </div>
    </>
  );
}
