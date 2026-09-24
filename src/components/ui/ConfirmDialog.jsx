import { useEffect, useRef } from 'react';
import Button from './Button';
import { common } from '../../i18n/he';
import styles from './ConfirmDialog.module.css';

// Native <dialog>: focus trap, Esc to close and backdrop come for free.
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, busy }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} onCancel={(e) => { e.preventDefault(); onCancel(); }}>
      <h2 className={styles.title}>{title}</h2>
      {body && <p className={styles.body}>{body}</p>}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{common.cancel}</Button>
        <Button onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </dialog>
  );
}
