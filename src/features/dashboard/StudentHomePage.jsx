import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchMyTeachers } from '../students/studentsApi';
import { fetchMyCourses } from '../content/contentApi';
import { fetchMyAssignments } from '../workspace/workspaceApi';
import { LoadingState } from '../../components/ui/States';
import Badge from '../../components/ui/Badge';
import { common, formatDateTime, studentHome as t, workspace as w } from '../../i18n/he';
import styles from './dashboard.module.css';

export default function StudentHomePage() {
  const { user, profile } = useAuth();
  const { status, data } = useAsync(() => fetchMyTeachers(user.id), [user.id]);
  const coursesQ = useAsync(() => fetchMyCourses(user.id), [user.id]);
  const assignmentsQ = useAsync(() => fetchMyAssignments(), [user.id]);
  const myAssignments = assignmentsQ.status === 'ready' ? assignmentsQ.data : [];
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
      {assignmentsQ.status === 'loading' && <LoadingState />}
      {myAssignments.length > 0 && (
        <section aria-labelledby="my-assignments">
          <h2 id="my-assignments" className={styles.sectionLabel}>{w.myAssignments}</h2>
          <ul className={styles.assignmentList}>
            {myAssignments.map((a) => {
              const state = a.status === 'closed' ? 'closed' : a.total > 0 && a.submitted === a.total ? 'done' : a.started ? 'progress' : 'new';
              const label = { closed: w.statusClosed, done: w.statusDone, progress: w.statusInProgress, new: w.statusNew }[state];
              return (
                <li key={a.id}>
                  <Link to={`/student/assignments/${a.id}`} className={styles.assignmentCard} data-state={state}>
                    <span className={styles.assignmentTop}>
                      <span className={styles.assignmentTitle}>{a.title}</span>
                      <Badge tone={{ closed: 'neutral', done: 'mint', progress: 'butter', new: 'lavender' }[state]}>{label}</Badge>
                    </span>
                    <span className={styles.assignmentMeta}>
                      {a.course?.title}{a.due_at ? ` · ${formatDateTime(a.due_at)}` : ''}
                    </span>
                    <span className={styles.assignmentProgress}>
                      <span className={styles.track}><span className={styles.fill} style={{ width: `${a.total ? (a.submitted / a.total) * 100 : 0}%` }} /></span>
                      <span>{w.progress(a.submitted, a.total)}</span>
                      <ChevronLeft size={18} aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {assignmentsQ.status !== 'loading' && myAssignments.length === 0 && <EmptyState icon={BookOpen} tone="mint" title={t.emptyTitle} body={t.emptyBody} />}
    </>
  );
}
