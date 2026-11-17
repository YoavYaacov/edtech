import { Link, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import LessonFrame from './LessonFrame';
import { fetchStudentLesson } from './lessonsApi';
import { progressKey } from './lessonProgress';
import { studentLessons as t } from '../../i18n/he';
import styles from './lessons.module.css';

// The shell (this page + AppShell) owns the header and navigation; the lesson owns everything below it.
export default function StudentLessonPage() {
  const { lessonId } = useParams();
  const { user } = useAuth();
  const q = useAsync(() => fetchStudentLesson(lessonId), [lessonId]);
  if (q.status === 'loading') return <LoadingState />;
  if (q.status === 'error') return <ErrorState message={t.loadError} onRetry={q.reload} />;
  if (!q.data) return <EmptyState title={t.notFoundTitle} body={t.notFoundBody} action={<Link to="/student/library">{t.back}</Link>} />;
  const { lesson, html } = q.data;
  return (
    <>
      <nav className={styles.crumbs} aria-label={t.back}>
        <Link to="/student/library">{t.back}</Link><ChevronLeft size={14} aria-hidden="true" />
        {lesson.course && <><Link to={`/student/subjects/${lesson.course.id}`}>{lesson.course.title}</Link><ChevronLeft size={14} aria-hidden="true" /></>}
        <span aria-current="page">{lesson.title}</span>
      </nav>
      <div className={styles.lessonWrap}>
        <LessonFrame key={lesson.published_version_id} html={html} title={t.frameTitle(lesson.title)}
          storageKey={progressKey(user.id, lesson.id, lesson.published_version_id)} />
      </div>
    </>
  );
}
