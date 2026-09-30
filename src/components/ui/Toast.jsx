import { useSyncExternalStore } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { common } from '../../i18n/he';
import styles from './Toast.module.css';

// Tiny app-wide toast (no library). showToast() can be called from anywhere — including right before a navigation —
// and <ToastHost/> (mounted once in AppShell) renders it fixed to the viewport, so it is visible however low the
// page is scrolled. role="status" + aria-live="polite": announced by screen readers without stealing focus.
let current = null; // { id, text, kind }
let seq = 0;
let timer = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function showToast(text, { kind = 'success', durationMs = 6000 } = {}) {
  clearTimeout(timer);
  current = { id: ++seq, text, kind };
  emit();
  timer = setTimeout(dismissToast, durationMs);
  return current.id;
}
export function dismissToast() {
  clearTimeout(timer);
  current = null;
  emit();
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function ToastHost() {
  const t = useSyncExternalStore(subscribe, () => current, () => null);
  return (
    <div className={styles.host} aria-live="polite" aria-atomic="true">
      {t && (
        <div key={t.id} className={`${styles.toast} ${t.kind === 'error' ? styles.error : styles.success}`} role="status">
          <CheckCircle2 size={20} aria-hidden="true" className={styles.icon} />
          <span className={styles.text}>{t.text}</span>
          <button type="button" className={styles.close} onClick={dismissToast} aria-label={common.close ?? 'סגירה'}><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </div>
  );
}
