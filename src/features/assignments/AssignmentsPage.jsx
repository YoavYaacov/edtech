import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import CourseGroups from '../../components/ui/CourseGroups';
import Select from '../../components/ui/Select';
import TextField from '../../components/ui/TextField';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { createAssignment, fetchAssignments } from './assignmentsApi';
import { courseLanguageList, fetchCourses } from '../content/contentApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { assignmentLabels as AL, assignmentLanguage as al, assignments as t, common, errors, formatDateTime, languages as langNames } from '../../i18n/he';
import styles from './assignments.module.css';

export const statusTone = { draft: 'butter', published: 'mint', closed: 'neutral' };

export default function AssignmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useAsync(() => fetchAssignments(), []);
  const coursesQ = useAsync(() => fetchCourses(), []);
  const [creating, setCreating] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const courses = (coursesQ.data ?? []).filter((c) => !c.is_archived);
  const selectedCourse = courses.find((c) => c.id === (courseId || courses[0]?.id));
  const createLangs = courseLanguageList(selectedCourse);

  async function create(e) {
    e.preventDefault();
    const cid = courseId || courses[0]?.id;
    if (!title.trim()) return setError(t.titleRequired);
    setBusy(true);
    setError('');
    const chosen = courses.find((c) => c.id === cid);
    const langs = courseLanguageList(chosen);
    const { data, error: err } = await createAssignment(user.id, { courseId: cid, title: title.trim(), language: langs.length > 1 ? (langs.includes(language) ? language : chosen.programming_language) : undefined });
    setBusy(false);
    if (err) return setError(errors.generic);
    navigate(`/teacher/assignments/${data.id}`);
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle}
        actions={!creating && courses.length > 0 && <Button icon={Plus} onClick={() => setCreating(true)}>{t.newAssignment}</Button>} />

      {creating && (
        <form className={styles.panel} onSubmit={create} noValidate>
          <h2 className={styles.panelTitle}>{t.newAssignment}</h2>
          <div className={styles.createGrid}>
            <TextField label={t.titleLabel} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
            <Select label={t.course} value={courseId || courses[0]?.id || ''} onChange={(e) => setCourseId(e.target.value)}
              options={courses.map((c) => ({ value: c.id, label: c.title }))} />
            {createLangs.length > 1 && (
              <Select label={al.label} value={createLangs.includes(language) ? language : selectedCourse.programming_language}
                onChange={(e) => setLanguage(e.target.value)} hint={al.hint}
                options={createLangs.map((l) => ({ value: l, label: langNames[l] ?? l }))} />
            )}
          </div>
          {error && <p className={styles.errorNote} role="alert">{error}</p>}
          <div className={styles.actionsRow}>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>{common.cancel}</Button>
            <Button type="submit" loading={busy}>{busy ? t.creating : t.create}</Button>
          </div>
        </form>
      )}

      {(list.status === 'loading' || coursesQ.status === 'loading') && <LoadingState />}
      {(list.status === 'error' || coursesQ.status === 'error') && <ErrorState message={errors.generic} onRetry={list.reload} />}
      {list.status === 'ready' && coursesQ.status === 'ready' && list.data.length === 0 && !creating && (
        <EmptyState icon={ClipboardList} title={t.emptyTitle} body={courses.length ? t.emptyBody : t.needCourse}
          action={courses.length > 0 && <Button icon={Plus} onClick={() => setCreating(true)}>{t.newAssignment}</Button>} />
      )}
      {list.status === 'ready' && list.data.length > 0 && (
        <CourseGroups items={list.data} getId={(a) => a.course?.id} getTitle={(a) => a.course?.title}
          scope="teacher-assignments" enabled={courses.length >= 2}>
          {(items) => (
          <ul className={styles.list}>
            {items.map((a) => (
              <li key={a.id}>
                <Link to={`/teacher/assignments/${a.id}`} className={styles.row}>
                  <span className={styles.rowTitle}>{a.title}</span>
                  <Badge tone={statusTone[a.status]}>{AL.status[a.status]}</Badge>
                {courseLanguageList(a.course).length > 1 && a.programming_language && <Badge tone="sky">{langNames[a.programming_language] ?? a.programming_language}</Badge>}
                  <span className={styles.rowSub}>
                    {a.course?.title} · {t.counts(a.assignment_questions?.[0]?.count ?? 0, a.assignment_students?.[0]?.count ?? 0)}
                    {' · '}{a.due_at ? `${t.due} ${formatDateTime(a.due_at)}` : t.noDue}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          )}
        </CourseGroups>
      )}
    </>
  );
}
