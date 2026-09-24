import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Plus } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import CourseForm from './CourseForm';
import { createCourse, fetchCourses } from './contentApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { common, courses as t, errors, languages } from '../../i18n/he';
import styles from './content.module.css';

export default function CoursesPage() {
  const { user } = useAuth();
  const { status, data, reload } = useAsync(() => fetchCourses(), []);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const all = data ?? [];
  const visible = all.filter((c) => showArchived || !c.is_archived);
  const hasArchived = all.some((c) => c.is_archived);

  async function handleCreate(values) {
    const res = await createCourse(user.id, values);
    if (!res.error) { setCreating(false); reload(); }
    return res;
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle}
        actions={!creating && <Button icon={Plus} onClick={() => setCreating(true)}>{t.newCourse}</Button>} />

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
      {status === 'ready' && visible.length > 0 && (
        <ul className={styles.courseGrid}>
          {visible.map((c) => (
            <li key={c.id}>
              <Link to={`/teacher/courses/${c.id}`} className={`${styles.courseCard} ${c.is_archived ? styles.dim : ''}`}>
                <span className={styles.courseTitle}>{c.title}</span>
                <span className={styles.courseMeta}>
                  {c.code && <Badge tone="lavender"><span dir="ltr">{c.code}</span></Badge>}
                  {c.programming_language && <Badge tone="sky">{languages[c.programming_language]}</Badge>}
                  {c.is_archived && <Badge>{common.archived}</Badge>}
                </span>
                <span className={styles.muted}>{t.topicsCount(c.topics?.[0]?.count ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {status === 'ready' && hasArchived && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {common.showArchived}
        </label>
      )}
    </>
  );
}
