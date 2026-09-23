import { BookOpen } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchMyTeachers } from '../students/studentsApi';
import { common, studentHome as t } from '../../i18n/he';
import styles from './dashboard.module.css';

export default function StudentHomePage() {
  const { user, profile } = useAuth();
  const { status, data } = useAsync(() => fetchMyTeachers(user.id), [user.id]);
  const teacherNames = status === 'ready' ? data.map((r) => r.teacher?.full_name).filter(Boolean) : [];

  return (
    <>
      <PageHeader
        title={common.hello(profile.full_name)}
        subtitle={teacherNames.length > 0 ? `${t.yourTeacher}: ${teacherNames.join(', ')}` : undefined}
      />
      <EmptyState icon={BookOpen} tone="mint" title={t.emptyTitle} body={t.emptyBody} />
    </>
  );
}
