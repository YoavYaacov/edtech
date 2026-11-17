import { Link, useParams } from 'react-router-dom';
import PageHeader from '../../components/ui/PageHeader';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAsync } from '../../lib/useAsync';
import ClassBoard from './ClassBoard';
import { fetchClassInfo, fetchLinkables } from './classesApi';
import { board as t, errors } from '../../i18n/he';

export default function TeacherClassBoardPage() {
  const { classId } = useParams();
  const cls = useAsync(() => fetchClassInfo(classId), [classId]);
  const courseId = cls.data?.course_id;
  const links = useAsync(() => (courseId ? fetchLinkables(courseId) : Promise.resolve({ data: null, error: null })), [courseId]);

  if (cls.status === 'loading') return <LoadingState />;
  if (cls.status === 'error' || !cls.data) return <ErrorState message={errors.generic} onRetry={cls.reload} />;
  return (
    <>
      <PageHeader title={t.teacherTitle(cls.data.title)} actions={<Link to={`/teacher/courses/${cls.data.course_id}`}>{t.back}</Link>} />
      <ClassBoard classId={classId} isTeacher linkables={links.data}
        lessonHref={(id) => `/teacher/lessons/${id}`} assignmentHref={(id) => `/teacher/assignments/${id}`} />
    </>
  );
}
