import { useSearchParams } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAsync } from '../../lib/useAsync';
import ClassBoard from './ClassBoard';
import { fetchMyClasses } from './classesApi';
import { board as t, errors } from '../../i18n/he';

export default function StudentBoardPage() {
  const [params, setParams] = useSearchParams();
  const mine = useAsync(() => fetchMyClasses(), []);
  if (mine.status === 'loading') return <LoadingState />;
  if (mine.status === 'error') return <ErrorState message={errors.generic} onRetry={mine.reload} />;
  const classes = mine.data ?? [];
  if (classes.length === 0) return (<><PageHeader title={t.title} /><EmptyState icon={MessageSquare} title={t.noClasses} /></>);
  // the id in the URL is only a preference: it must be one of MY classes, and the database re-checks membership anyway
  const current = classes.find((c) => c.class_id === params.get('class')) ?? classes[0];
  return (
    <>
      <PageHeader title={t.title} subtitle={`${current.course_title} · ${current.class_title}`}
        actions={classes.length > 1 && (
          <select aria-label={t.pickClass} value={current.class_id} onChange={(e) => setParams({ class: e.target.value })}>
            {classes.map((c) => <option key={c.class_id} value={c.class_id}>{`${c.course_title} · ${c.class_title}`}</option>)}
          </select>
        )} />
      <ClassBoard key={current.class_id} classId={current.class_id}
        lessonHref={(id) => `/student/lessons/${id}`} assignmentHref={(id) => `/student/assignments/${id}`} />
    </>
  );
}
