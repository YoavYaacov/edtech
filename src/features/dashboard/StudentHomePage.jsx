import { BookOpen } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchMyTeachers } from '../students/studentsApi';
import { fetchMyCourses } from '../content/contentApi';
import Badge from '../../components/ui/Badge';
import { common, studentHome as t } from '../../i18n/he';
import styles from './dashboard.module.css';

export default function StudentHomePage() {
  const { user, profile } = useAuth();
  const { status, data } = useAsync(() => fetchMyTeachers(user.id), [user.id]);
  const coursesQ = useAsync(() => fetchMyCourses(user.id), [user.id]);
  const myCourses = coursesQ.status === 'ready' ? coursesQ.data.map((r) => r.course).filter(Boolean) : [];
  const teacherNames = status === 'ready' ? data.map((r) => r.teacher?.full_name).filter(Boolean) : [];

  return (
    <>
      <PageHeader
        title={common.hello(profile.full_name)}
        subtitle={teacherNames.length > 0 ? `${t.yourTeacher}: ${teacherNames.join(', ')}` : undefined}
      />
      {myCourses.length > 0 && (
        <section className={styles.courses} aria-label={t.myCourses}>
          <h2 className={styles.sectionLabel}>{t.myCourses}</h2>
          <div className={styles.chips}>
            {myCourses.map((c) => (
              <Badge key={c.id} tone="lavender">{c.title}{c.code ? ` · ${c.code}` : ''}</Badge>
            ))}
          </div>
        </section>
      )}
      <EmptyState icon={BookOpen} tone="mint" title={t.emptyTitle} body={t.emptyBody} />
    </>
  );
}
