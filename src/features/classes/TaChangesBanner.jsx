import { Link } from 'react-router-dom';
import { useAsync } from '../../lib/useAsync';
import { taPending } from './classesApi';
import { taSync as t } from '../../i18n/he';
import styles from '../auth/authForms.module.css';

// Appears on its own when TeacherApp differs from the classes (changed students, new groups). Silent for anyone who
// is not the TeacherApp owner and when the lookup fails.
export default function TaChangesBanner() {
  const q = useAsync(async () => {
    const { data, error } = await taPending();
    return { data: error || !data?.ok ? null : data, error: null };
  }, []);
  const d = q.data;
  if (!d) return null;
  const classes = d.classes ?? [];
  if (classes.length === 0 && !(d.unlinked_groups > 0)) return null;
  return (
    <div role="status" data-testid="ta-banner">
      {classes.map((c) => (
        <p key={c.class_id} className={`${styles.notice} ${styles.noticeSuccess}`}>
          {t.bannerClass(c.title, c.pending)} <Link to={`/teacher/courses/${c.course_id}`}>{t.review}</Link>
        </p>
      ))}
      {d.unlinked_groups > 0 && (
        <p className={`${styles.notice} ${styles.noticeSuccess}`}>
          {t.bannerGroups(d.unlinked_groups)} <Link to="/teacher/courses">{t.review}</Link>
        </p>
      )}
    </div>
  );
}
