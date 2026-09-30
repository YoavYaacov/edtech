import { useState } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { courseOrder as t, languages } from '../../i18n/he';
import { courseLanguageList } from './contentApi';
import styles from './content.module.css';

// Explicit "arrange courses" mode. Arrow buttons (not drag & drop): reliable on touch, keyboard and screen readers.
// Rows are NOT links here, so nothing navigates while arranging. Nothing is saved until "שמירת הסדר".
export default function CourseOrderList({ courses, onSave, onCancel }) {
  const [order, setOrder] = useState(courses);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announce, setAnnounce] = useState('');
  const dirty = order.some((c, i) => c.id !== courses[i].id);

  function move(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setAnnounce(t.moved(next[j].title, j + 1, next.length));
  }

  async function save() {
    setBusy(true); setError('');
    const ok = await onSave(order.map((c) => c.id));
    setBusy(false);
    if (!ok) setError(t.error);
  }

  return (
    <section className={styles.panel} aria-labelledby="order-title">
      <h2 id="order-title" className={styles.panelTitle}>{t.title}</h2>
      <p className={styles.muted}>{t.explain}</p>
      <ol className={styles.orderList}>
        {order.map((c, i) => (
          <li key={c.id} className={styles.orderRow}>
            <span className={styles.orderNum} aria-hidden="true">{i + 1}</span>
            <span className={styles.orderTitle}>{c.title}</span>
            <span className={styles.courseMeta}>
              {courseLanguageList(c).map((l) => <Badge key={l} tone="sky">{languages[l]}</Badge>)}
            </span>
            <span className={styles.orderBtns}>
              <button type="button" className={styles.orderBtn} disabled={busy || i === 0}
                aria-label={`${t.up}: ${c.title}`} title={t.up} onClick={() => move(i, -1)}><ArrowUp size={18} aria-hidden="true" /></button>
              <button type="button" className={styles.orderBtn} disabled={busy || i === order.length - 1}
                aria-label={`${t.down}: ${c.title}`} title={t.down} onClick={() => move(i, 1)}><ArrowDown size={18} aria-hidden="true" /></button>
            </span>
          </li>
        ))}
      </ol>
      <p className={styles.srOnly} role="status" aria-live="polite">{announce}</p>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      <div className={styles.orderActions}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t.cancel}</Button>
        <Button icon={Check} loading={busy} disabled={!dirty} onClick={save}>{busy ? t.saving : t.save}</Button>
      </div>
    </section>
  );
}
