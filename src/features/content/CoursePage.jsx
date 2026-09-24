import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronRight, Pencil } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/ui/States';
import CourseForm from './CourseForm';
import TopicTree from './TopicTree';
import EnrollmentPanel from './EnrollmentPanel';
import { fetchCourse, fetchTopics, updateCourse } from './contentApi';
import { useAsync } from '../../lib/useAsync';
import { common, courses as t, errors, languages, nav } from '../../i18n/he';
import styles from './content.module.css';

export default function CoursePage() {
  const { courseId } = useParams();
  const course = useAsync(() => fetchCourse(courseId), [courseId]);
  const topicsQ = useAsync(() => fetchTopics(courseId), [courseId]);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (course.status === 'loading') return <LoadingState />;
  if (course.status === 'error') return <ErrorState message={errors.generic} onRetry={course.reload} />;
  if (!course.data) return <ErrorState message={t.notFound}><Link to="/teacher/courses">{nav.courses}</Link></ErrorState>;

  const c = course.data;

  async function save(values) {
    const res = await updateCourse(c.id, values);
    if (!res.error) { setEditing(false); course.reload(); }
    return res;
  }

  async function setArchived(value) {
    setBusy(true);
    setError('');
    const { error: err } = await updateCourse(c.id, { is_archived: value });
    setBusy(false);
    setConfirmArchive(false);
    if (err) return setError(errors.generic);
    course.reload();
  }

  return (
    <>
      <Link to="/teacher/courses" className={styles.backLink}><ChevronRight size={16} aria-hidden="true" />{nav.courses}</Link>
      <PageHeader title={c.title}
        subtitle={c.description || undefined}
        actions={!editing && <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{t.editDetails}</Button>} />
      <div className={styles.metaRow}>
        {c.code && <Badge tone="lavender"><span dir="ltr">{c.code}</span></Badge>}
        {c.programming_language && <Badge tone="sky">{languages[c.programming_language]}</Badge>}
        {c.is_archived && <Badge tone="butter">{t.archivedNotice}</Badge>}
      </div>

      {editing && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t.details}</h2>
          <CourseForm initial={c} submitLabel={common.save} busyLabel={common.saving}
            onSubmit={save} onCancel={() => setEditing(false)} />
        </section>
      )}

      <div className={styles.stack}>
        {topicsQ.status === 'loading' && <LoadingState />}
        {topicsQ.status === 'error' && <ErrorState message={errors.generic} onRetry={topicsQ.reload} />}
        {topicsQ.status === 'ready' && <TopicTree courseId={c.id} topics={topicsQ.data} onChanged={topicsQ.reload} />}
        <EnrollmentPanel courseId={c.id} />
      </div>

      <div className={styles.dangerZone}>
        {error && <p className={styles.errorNote} role="alert">{error}</p>}
        {c.is_archived ? (
          <Button variant="secondary" icon={ArchiveRestore} loading={busy} onClick={() => setArchived(false)}>{t.restoreCourse}</Button>
        ) : (
          <Button variant="ghost" icon={Archive} onClick={() => setConfirmArchive(true)}>{t.archiveCourse}</Button>
        )}
      </div>
      <ConfirmDialog open={confirmArchive} title={t.archiveCourse} body={t.archiveCourseBody}
        confirmLabel={common.archive} busy={busy} onConfirm={() => setArchived(true)} onCancel={() => setConfirmArchive(false)} />
    </>
  );
}
