import { useState } from 'react';
import { UserMinus, UserPlus } from 'lucide-react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { enrollStudent, fetchEnrollments, unenrollStudent } from './contentApi';
import { fetchMyStudents } from '../students/studentsApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { enrollment as t, errors } from '../../i18n/he';
import styles from './content.module.css';

export default function EnrollmentPanel({ courseId }) {
  const { user } = useAuth();
  const enrolled = useAsync(() => fetchEnrollments(courseId), [courseId]);
  const mine = useAsync(() => fetchMyStudents(user.id), [user.id]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loading = enrolled.status === 'loading' || mine.status === 'loading';
  const failed = enrolled.status === 'error' || mine.status === 'error';
  const enrolledIds = new Set((enrolled.data ?? []).map((e) => e.student_id));
  const candidates = (mine.data ?? []).filter((r) => r.status === 'active' && !enrolledIds.has(r.student.id));

  async function act(fn) {
    setBusy(true);
    setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) return setError(errors.generic);
    setSelected('');
    enrolled.reload();
  }

  return (
    <section className={styles.panel} aria-labelledby="enroll-title">
      <h2 id="enroll-title" className={styles.panelTitle}>{t.title}</h2>
      <p className={styles.muted}>{t.explain}</p>
      {loading && <LoadingState />}
      {failed && <ErrorState message={errors.generic} onRetry={() => { enrolled.reload(); mine.reload(); }} />}
      {!loading && !failed && (
        <>
          {enrolled.data.length === 0 ? (
            <p className={styles.muted}>{t.empty}</p>
          ) : (
            <ul className={styles.simpleList}>
              {enrolled.data.map((e) => (
                <li key={e.student_id} className={styles.simpleRow}>
                  <span>{e.student?.full_name}</span>
                  <Button variant="ghost" icon={UserMinus} disabled={busy}
                    onClick={() => act(() => unenrollStudent(courseId, e.student_id))}>{t.remove}</Button>
                </li>
              ))}
            </ul>
          )}
          {(mine.data ?? []).length === 0 ? (
            <p className={styles.muted}>{t.noStudents}</p>
          ) : candidates.length === 0 ? (
            enrolled.data.length > 0 && <p className={styles.muted}>{t.noCandidates}</p>
          ) : (
            <div className={styles.enrollForm}>
              <Select label={t.choose} placeholder="—" value={selected} onChange={(e) => setSelected(e.target.value)}
                options={candidates.map((r) => ({ value: r.student.id, label: r.student.full_name }))} />
              <Button icon={UserPlus} disabled={!selected} loading={busy}
                onClick={() => act(() => enrollStudent(courseId, selected))}>{t.add}</Button>
            </div>
          )}
          {error && <p className={styles.errorNote} role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
