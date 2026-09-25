import { useState } from 'react';
import { UserMinus, UserPlus, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { ErrorState, LoadingState } from '../../components/ui/States';
import InviteStudentForm from '../students/InviteStudentForm';
import { enrollStudent, fetchEnrollments, unenrollStudent } from './contentApi';
import { fetchMyStudents } from '../students/studentsApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { enrollment as t, errors, students as st } from '../../i18n/he';
import styles from './content.module.css';

// "Students in course". A clear "+ add student" action is always available,
// with two paths: an existing student of mine, or a NEW student invited through
// the existing invite-student Edge Function (which also enrolls atomically).
export default function EnrollmentPanel({ courseId }) {
  const { user } = useAuth();
  const enrolled = useAsync(() => fetchEnrollments(courseId), [courseId]);
  const mine = useAsync(() => fetchMyStudents(user.id), [user.id]);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState('existing'); // existing | new
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loading = enrolled.status === 'loading' || mine.status === 'loading';
  const failed = enrolled.status === 'error' || mine.status === 'error';
  const enrolledIds = new Set((enrolled.data ?? []).map((e) => e.student_id));
  const candidates = (mine.data ?? []).filter((r) => r.status === 'active' && !enrolledIds.has(r.student.id));
  const effectiveMode = candidates.length === 0 ? 'new' : mode;

  function openAdd() {
    setAdding(true);
    setMode(candidates.length > 0 ? 'existing' : 'new');
    setError('');
    setSuccess('');
  }

  async function addExisting() {
    const name = candidates.find((r) => r.student.id === selected)?.student.full_name ?? '';
    setBusy(true);
    setError('');
    setSuccess('');
    const { error: err } = await enrollStudent(courseId, selected);
    setBusy(false);
    if (err) return setError(err.code === '23505' ? t.alreadyEnrolled : errors.generic);
    setSelected('');
    setSuccess(t.enrolled(name));
    setAdding(false);
    enrolled.reload();
  }

  async function remove(studentId) {
    setBusy(true);
    setError('');
    setSuccess('');
    const { error: err } = await unenrollStudent(courseId, studentId);
    setBusy(false);
    if (err) return setError(errors.generic);
    enrolled.reload();
  }

  return (
    <section className={styles.panel} aria-labelledby="enroll-title">
      <div className={styles.panelHeadRow}>
        <h2 id="enroll-title" className={styles.panelTitle}>{t.title}</h2>
        {!adding && !loading && !failed && (
          <Button variant="secondary" icon={UserPlus} onClick={openAdd}>{t.addStudent}</Button>
        )}
      </div>
      <p className={styles.muted}>{t.explain}</p>
      {loading && <LoadingState />}
      {failed && <ErrorState message={errors.generic} onRetry={() => { enrolled.reload(); mine.reload(); }} />}
      {!loading && !failed && (
        <>
          {success && <p className={styles.successNote} role="status">{success}</p>}
          {enrolled.data.length === 0 ? (
            <p className={styles.muted}>{t.empty}</p>
          ) : (
            <ul className={styles.simpleList}>
              {enrolled.data.map((e) => (
                <li key={e.student_id} className={styles.simpleRow}>
                  <span>{e.student?.full_name}</span>
                  <Button variant="ghost" icon={UserMinus} disabled={busy}
                    onClick={() => remove(e.student_id)}>{t.remove}</Button>
                </li>
              ))}
            </ul>
          )}

          {adding && (
            <div className={styles.addBox}>
              <div className={styles.addHead}>
                <div className={styles.segmented} role="tablist" aria-label={t.addStudent}>
                  <button type="button" role="tab" aria-selected={effectiveMode === 'existing'}
                    className={effectiveMode === 'existing' ? styles.segOn : ''}
                    disabled={candidates.length === 0} onClick={() => setMode('existing')}>{t.modeExisting}</button>
                  <button type="button" role="tab" aria-selected={effectiveMode === 'new'}
                    className={effectiveMode === 'new' ? styles.segOn : ''} onClick={() => setMode('new')}>{t.modeNew}</button>
                </div>
                <button type="button" className={styles.iconBtn} onClick={() => setAdding(false)}
                  aria-label={t.cancelAdd} title={t.cancelAdd}><X size={18} /></button>
              </div>

              {effectiveMode === 'existing' ? (
                <>
                  <p className={styles.muted}>{t.existingExplain}</p>
                  <div className={styles.enrollForm}>
                    <Select label={t.choose} placeholder="—" value={selected} onChange={(e) => setSelected(e.target.value)}
                      options={candidates.map((r) => ({ value: r.student.id, label: r.student.full_name }))} />
                    <Button icon={UserPlus} disabled={!selected} loading={busy} onClick={addExisting}>{t.add}</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.muted}>
                    {candidates.length === 0 && (mine.data ?? []).length > 0 ? `${t.noExistingCandidates} ` : ''}{t.newExplain}
                  </p>
                  <InviteStudentForm embedded courseId={courseId}
                    onInvited={(name) => {
                      // Message lives in the panel, so reloading the lists doesn't erase it.
                      setSuccess(st.invitedToCourse(name));
                      setAdding(false);
                      enrolled.reload();
                      mine.reload();
                    }} />
                </>
              )}
            </div>
          )}
          {error && <p className={styles.errorNote} role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
