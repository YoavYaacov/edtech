import { useEffect, useState } from 'react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TextField from '../../components/ui/TextField';
import { deleteStudent, previewStudentDeletion } from './studentsApi';
import { common, students as st } from '../../i18n/he';
import styles from './students.module.css';

const t = st.delete;

// Explicit HARD delete: always shows what will be removed first, then requires typing the student's name.
// The server (delete-student) re-checks authorization/ownership; nothing here is trusted.
export default function DeleteStudentDialog({ student, onClose, onDeleted }) {
  const [state, setState] = useState({ phase: 'loading' }); // loading | ready | error
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await previewStudentDeletion(student.id);
      if (!live) return;
      if (res.ok) setState({ phase: 'ready', name: res.name, counts: res.counts });
      else setState({ phase: 'error', message: t.errors[res.errorCode] ?? t.errors.generic });
    })();
    return () => { live = false; };
  }, [student.id]);

  async function confirm() {
    setBusy(true);
    setError('');
    const res = await deleteStudent(student.id, typed);
    setBusy(false);
    if (res.ok) return onDeleted(state.name || student.full_name);
    setError(t.errors[res.errorCode] ?? t.errors.generic);
  }

  const ready = state.phase === 'ready';
  const nameOk = ready && typed.trim() !== '' && typed.trim() === (state.name ?? '').trim();

  return (
    <ConfirmDialog open danger title={t.title(student.full_name)}
      confirmLabel={ready ? t.confirm : null} cancelLabel={ready ? undefined : common.close}
      busy={busy} confirmDisabled={!nameOk} onConfirm={confirm} onCancel={onClose}
      body={state.phase === 'loading' ? t.loading : state.phase === 'error' ? state.message : t.intro}>
      {ready && (
        <div className={styles.deleteInfo}>
          <p className={styles.deleteList}>{t.willDelete}</p>
          <ul className={styles.deleteCounts}>
            {Object.entries(state.counts).filter(([, n]) => n > 0).map(([k, n]) => (
              <li key={k}>{t.count(t.labels[k], n)}</li>
            ))}
          </ul>
          <TextField label={t.typeLabel} hint={t.typeName(state.name)} autoComplete="off"
            value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </ConfirmDialog>
  );
}
