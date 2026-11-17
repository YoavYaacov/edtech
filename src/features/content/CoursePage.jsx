import { useState } from 'react';
import { Copy } from 'lucide-react';
import { showToast } from '../../components/ui/Toast';
import { buildTopicsExport, copyText } from './topicsExport';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/ui/States';
import CourseForm from './CourseForm';
import TopicTree from './TopicTree';
import EnrollmentPanel from './EnrollmentPanel';
import ClassesPanel from './ClassesPanel';
import MistakeTagsPanel from './MistakeTagsPanel';
import CourseLanguagesPanel from './CourseLanguagesPanel';
import { courseLanguageList, deleteCourse, fetchClasses, fetchCourse, fetchTopicStatuses, fetchTopics, updateCourse } from './contentApi';
import { blockedReason, useSafeDelete } from './useSafeDelete';
import { useAsync } from '../../lib/useAsync';
import { common, courses as t, errors, flash, languages, nav, safeDelete as sd } from '../../i18n/he';
import styles from './content.module.css';

export default function CoursePage() {
  const { courseId } = useParams();
  const course = useAsync(() => fetchCourse(courseId), [courseId]);
  const topicsQ = useAsync(() => fetchTopics(courseId), [courseId]);
  const statusQ = useAsync(() => fetchTopicStatuses(courseId), [courseId]);
  const classesQ = useAsync(() => fetchClasses(courseId), [courseId]);
  const [pickedClass, setPickedClass] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const del = useSafeDelete({
    check: (id) => deleteCourse(id, { dryRun: true }),
    remove: (id) => deleteCourse(id, { dryRun: false }),
    onDeleted: () => navigate('/teacher/courses', { replace: true, state: { flash: flash.courseDeleted } }),
  });

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
        actions={!editing && (
          <>
            {topicsQ.status === 'ready' && (
              <Button variant="secondary" icon={Copy} onClick={async () => {
                const ok = await copyText(JSON.stringify(buildTopicsExport(c, topicsQ.data)));
                showToast(ok ? t.copyForClaudeDone : t.copyForClaudeFail, { kind: ok ? 'success' : 'error' });
              }}>{t.copyForClaude}</Button>
            )}
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>{t.editDetails}</Button>
          </>
        )} />
      <div className={styles.metaRow}>
        {c.code && <Badge tone="lavender"><span dir="ltr">{c.code}</span></Badge>}
        {courseLanguageList(c).map((l) => <Badge key={l} tone="sky">{languages[l]}</Badge>)}
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
        {topicsQ.status === 'ready' && (() => {
          const classList = classesQ.status === 'ready' ? classesQ.data : [];
          const activeClass = classList.some((x) => x.id === pickedClass) ? pickedClass : (classList[0]?.id ?? '');
          return (
            <TopicTree courseId={c.id} topics={topicsQ.data} classes={classList} classId={activeClass}
              onClassChange={setPickedClass} onChanged={() => { topicsQ.reload(); statusQ.reload(); }}
              statusAvailable={statusQ.status === 'ready' && classesQ.status === 'ready'}
              statuses={new Map((statusQ.data ?? []).filter((r) => r.class_id === activeClass).map((r) => [r.topic_id, r.status]))} />
          );
        })()}
        {classesQ.status === 'ready' && <ClassesPanel courseId={c.id} classes={classesQ.data} onChanged={() => { classesQ.reload(); statusQ.reload(); }} />}
        {topicsQ.status === 'ready' && <MistakeTagsPanel courseId={c.id} topics={topicsQ.data} />}
        {c.programming_language && <CourseLanguagesPanel course={c} languages={courseLanguageList(c)} onChanged={course.reload} />}
        <EnrollmentPanel courseId={c.id} languages={courseLanguageList(c)} primaryLanguage={c.programming_language} />
      </div>

      <div className={styles.dangerZone}>
        {(error || del.error) && <p className={styles.errorNote} role="alert">{error || del.error}</p>}
        {c.is_archived ? (
          <Button variant="secondary" icon={ArchiveRestore} loading={busy} onClick={() => setArchived(false)}>{t.restoreCourse}</Button>
        ) : (
          <Button variant="ghost" icon={Archive} onClick={() => setConfirmArchive(true)}>{t.archiveCourse}</Button>
        )}
        <Button variant="dangerGhost" icon={Trash2} loading={del.busy && !del.state} onClick={() => del.start(c)}>
          {sd.deleteForever}
        </Button>
      </div>
      <ConfirmDialog open={confirmArchive} title={t.archiveCourse} body={t.archiveCourseBody}
        confirmLabel={common.archive} busy={busy} onConfirm={() => setArchived(true)} onCancel={() => setConfirmArchive(false)} />
      {del.state && (del.state.mode === 'confirm' ? (
        <ConfirmDialog open danger title={sd.courseTitle(c.title)}
          body={`${sd.courseBody(del.state.info.topics)} ${sd.irreversible}`}
          confirmLabel={sd.deleteForever} busy={del.busy} onConfirm={del.confirm} onCancel={del.close} />
      ) : (
        <ConfirmDialog open title={sd.courseBlockedTitle}
          body={`${blockedReason(del.state.info)} ${c.is_archived ? sd.alreadyArchivedHint : sd.archiveHint}`}
          confirmLabel={c.is_archived ? null : sd.archiveInstead} cancelLabel={sd.close} busy={busy}
          onConfirm={async () => { await setArchived(true); del.close(); }} onCancel={del.close} />
      ))}
    </>
  );
}
