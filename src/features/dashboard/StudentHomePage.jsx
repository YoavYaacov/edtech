import { Link } from 'react-router-dom';
import { BookOpen, CalendarClock, ChevronLeft, Library } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchMyTeachers } from '../students/studentsApi';
import { fetchMyCourses } from '../content/contentApi';
import { fetchMyAssignments } from '../workspace/workspaceApi';
import { fetchLibrary } from '../student/studentApi';
import { mainTopics, statusOf, upcomingDeadlines } from '../student/learningMap';
import StatusBadge from '../student/StatusBadge';
import studentStyles from '../student/student.module.css';
import { LoadingState } from '../../components/ui/States';
import CourseGroups from '../../components/ui/CourseGroups';
import Badge from '../../components/ui/Badge';
import { common, formatDateTime, studentHome as t, workspace as w } from '../../i18n/he';
import styles from './dashboard.module.css';

export default function StudentHomePage() {
  const { user, profile } = useAuth();
  const { status, data } = useAsync(() => fetchMyTeachers(user.id), [user.id]);
  const coursesQ = useAsync(() => fetchMyCourses(user.id), [user.id]);
  const assignmentsQ = useAsync(() => fetchMyAssignments(), [user.id]);
  const libQ = useAsync(() => fetchLibrary(user.id), [user.id]);
  const myAssignments = assignmentsQ.status === 'ready' ? assignmentsQ.data : [];
  const myCourses = coursesQ.status === 'ready' ? coursesQ.data.map((r) => r.course).filter(Boolean) : [];
  const upcoming = upcomingDeadlines(myAssignments);
  const nowLearning = libQ.status === 'ready'
    ? libQ.data.subjects.flatMap((sub) => mainTopics(libQ.data.topics.filter((x) => x.course_id === sub.id))
      .filter((x) => statusOf(libQ.data.statuses, x.id) === 'learning').map((x) => ({ ...x, subject: sub })))
    : [];
  const teacherNames = status === 'ready' ? data.map((r) => r.teacher?.full_name).filter(Boolean) : [];

  return (
    <>
      <PageHeader
        title={common.hello(profile.full_name)}
        subtitle={teacherNames.length > 0 ? `${t.yourTeacher}: ${teacherNames.join(', ')}` : undefined}
      />
      <div className={studentStyles.shortcuts}>
        <Link to="/student/subjects" className={studentStyles.shortcut}><BookOpen size={18} aria-hidden="true" />{t.toSubjects}</Link>
        <Link to="/student/library" className={studentStyles.shortcut}><Library size={18} aria-hidden="true" />{t.toLibrary}</Link>
      </div>
      <div className={studentStyles.twoCol}>
        <section className={studentStyles.panel} aria-labelledby="home-upcoming">
          <h2 id="home-upcoming" className={studentStyles.sectionLabel} style={{ marginTop: 0 }}>{t.upcoming}</h2>
          {upcoming.length === 0 ? <p className={studentStyles.muted}>{t.upcomingNone}</p> : (
            <ul className={studentStyles.rows}>
              {upcoming.map((a) => (
                <li key={a.id} className={studentStyles.row}>
                  <CalendarClock size={18} aria-hidden="true" color="var(--peach-700)" />
                  <Link to={`/student/assignments/${a.id}`} className={`${studentStyles.rowMain} ${studentStyles.rowLink}`}>
                    <span className={studentStyles.rowTitle}>{a.title}</span>
                    <span className={studentStyles.rowMeta}>{t.dueOn(formatDateTime(a.due_at))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={studentStyles.panel} aria-labelledby="home-learning">
          <h2 id="home-learning" className={studentStyles.sectionLabel} style={{ marginTop: 0 }}>{t.currentTopics}</h2>
          {nowLearning.length === 0 ? <p className={studentStyles.muted}>{t.currentNone}</p> : (
            <ul className={studentStyles.rows}>
              {nowLearning.slice(0, 6).map((x) => (
                <li key={x.id} className={studentStyles.row}>
                  <Link to={`/student/subjects/${x.subject.id}`} className={`${studentStyles.rowMain} ${studentStyles.rowLink}`}>
                    <span className={studentStyles.rowTitle}>{x.title}</span>
                    <span className={studentStyles.rowMeta}>{x.subject.title}</span>
                  </Link>
                  <StatusBadge status="learning" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {myCourses.length > 0 && (
        <section className={styles.courses} style={{ marginTop: 'var(--space-5)' }} aria-label={t.myCourses}>
          <h2 className={styles.sectionLabel}>{t.myCourses}</h2>
          <div className={styles.chips}>
            {myCourses.map((c) => (
              <Link key={c.id} to={`/student/subjects/${c.id}`}><Badge tone="lavender">{c.title}</Badge></Link>
            ))}
          </div>
        </section>
      )}
      {assignmentsQ.status === 'loading' && <LoadingState />}
      {myAssignments.length > 0 && (
        <section aria-labelledby="my-assignments">
          <h2 id="my-assignments" className={styles.sectionLabel}>{w.myAssignments}</h2>
          <CourseGroups items={myAssignments} getId={(a) => a.course_id} getTitle={(a) => a.course?.title}
            scope="student-assignments">
            {(items) => (
            <ul className={styles.assignmentList}>
              {items.map((a) => {
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
            )}
          </CourseGroups>
        </section>
      )}
      {assignmentsQ.status !== 'loading' && myAssignments.length === 0 && <EmptyState icon={BookOpen} tone="mint" title={t.emptyTitle} body={t.emptyBody} />}
    </>
  );
}
