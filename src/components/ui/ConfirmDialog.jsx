import { useEffect, useRef } from 'react';
import Button from './Button';
import { common } from '../../i18n/he';
import styles from './ConfirmDialog.module.css';

// Native <dialog>: focus trap, Esc to close and backdrop come for free.
// confirmLabel = null → only a close button (used to explain why an action is blocked).
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel, busy, danger = false, cancelLabel, children, confirmDisabled = false }) {
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
      {children}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel ?? common.cancel}</Button>
        {confirmLabel && (
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={confirmDisabled}>{confirmLabel}</Button>
        )}
      </div>
    </dialog>
  );
}
