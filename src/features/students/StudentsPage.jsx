import { Users } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import InviteStudentForm from './InviteStudentForm';
import { fetchMyStudents } from './studentsApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { common, errors, formatDate, students as t } from '../../i18n/he';
import styles from './students.module.css';

export default function StudentsPage() {
  const { user } = useAuth();
  const { status, data, reload } = useAsync(() => fetchMyStudents(user.id), [user.id]);

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <InviteStudentForm onInvited={reload} />

      <div className={styles.listArea}>
        {status === 'loading' && <LoadingState />}
        {status === 'error' && <ErrorState message={errors.generic} onRetry={reload} />}
        {status === 'ready' && data.length === 0 && (
          <EmptyState icon={Users} tone="sky" title={t.emptyTitle} body={t.emptyBody} />
        )}
        {status === 'ready' && data.length > 0 && (
          <ul className={styles.list}>
            {data.map((row) => (
              <li key={row.student.id} className={styles.row}>
                <span className={styles.avatar} aria-hidden="true">
                  {row.student.full_name?.trim()?.[0] ?? '?'}
                </span>
                <div className={styles.rowText}>
                  <span className={styles.name}>{row.student.full_name}</span>
                  <span className={styles.muted}>{common.since} {formatDate(row.created_at)}</span>
                </div>
                <span className={`${styles.badge} ${styles[row.status]}`}>{t.status[row.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
