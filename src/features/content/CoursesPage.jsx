import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpDown, Library, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import CourseForm from './CourseForm';
import CourseOrderList from './CourseOrderList';
import { courseLanguageList, createCourse, fetchCourses, reorderCourses } from './contentApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { common, courseOrder as co, courses as t, errors, languages } from '../../i18n/he';
import styles from './content.module.css';

export default function CoursesPage() {
  const { user } = useAuth();
  const { status, data, reload } = useAsync(() => fetchCourses(), []);
  const [creating, setCreating] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [notice, setNotice] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const location = useLocation();
  const [flashMsg] = useState(location.state?.flash ?? '');

  const all = data ?? [];
  const visible = all.filter((c) => showArchived || !c.is_archived);
  const hasArchived = all.some((c) => c.is_archived);

  const active = all.filter((c) => !c.is_archived);

  async function saveOrder(ids) {
    const { error } = await reorderCourses(ids);
    if (error) return false;
    setOrdering(false);
    setNotice(co.saved);
    reload();
    return true;
  }

  async function handleCreate(values) {
    const res = await createCourse(user.id, values);
    if (!res.error) { setCreating(false); reload(); }
    return res;
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle}
        actions={!creating && !ordering && (
          <>
            {active.length > 1 && <Button variant="secondary" icon={ArrowUpDown} onClick={() => { setNotice(''); setOrdering(true); }}>{co.start}</Button>}
            <Button icon={Plus} onClick={() => setCreating(true)}>{t.newCourse}</Button>
          </>
        )} />

      {(flashMsg || notice) && <p className={styles.successNote} role="status">{notice || flashMsg}</p>}
      {creating && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>{t.newCourse}</h2>
          <CourseForm submitLabel={t.create} busyLabel={t.creating}
            onSubmit={handleCreate} onCancel={() => setCreating(false)} />
        </section>
      )}

      {status === 'loading' && <LoadingState />}
      {status === 'error' && <ErrorState message={errors.generic} onRetry={reload} />}
      {status === 'ready' && all.length === 0 && !creating && (
        <EmptyState icon={Library} title={t.emptyTitle} body={t.emptyBody}
          action={<Button icon={Plus} onClick={() => setCreating(true)}>{t.newCourse}</Button>} />
      )}
      {status === 'ready' && ordering && (
        <CourseOrderList courses={active} onSave={saveOrder} onCancel={() => setOrdering(false)} />
      )}
      {status === 'ready' && !ordering && visible.length > 0 && (
        <ul className={styles.courseGrid}>
          {visible.map((c) => (
            <li key={c.id}>
              <Link to={`/teacher/courses/${c.id}`} className={`${styles.courseCard} ${c.is_archived ? styles.dim : ''}`}
                data-kind={c.programming_language ? 'code' : 'other'}>
                <span className={styles.courseTitle}>{c.title}</span>
                <span className={styles.courseMeta}>
                  {c.code && <Badge tone="lavender"><span dir="ltr">{c.code}</span></Badge>}
                  {courseLanguageList(c).map((l) => <Badge key={l} tone="sky">{languages[l]}</Badge>)}
                  {c.is_archived && <Badge>{common.archived}</Badge>}
                </span>
                <span className={styles.muted}>{t.topicsCount(c.topics?.[0]?.count ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {status === 'ready' && hasArchived && !ordering && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {common.showArchived}
        </label>
      )}
    </>
  );
}
