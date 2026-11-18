import { useState } from 'react';
import Button from '../../components/ui/Button';
import { taLinkGroup } from './classesApi';
import { errors, taSync as t } from '../../i18n/he';
import styles from '../content/content.module.css';

// Course level: link a TeacherApp group to a new class (named like the group) or to an existing class of this subject.
export default function TaLinkForm({ courseId, groups, freeClasses, onLinked }) {
  const [group, setGroup] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function link() {
    setBusy(true); setError('');
    const { data, error: err } = await taLinkGroup(courseId, group, target || null);
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    if (!data?.ok) { setError(t.errors[data?.reason] ?? errors.generic); return; }
    setGroup(''); setTarget('');
    await onLinked?.(data.class_id);
  }

  if (groups.length === 0) return null;
  return (
    <div className={styles.classHead} data-testid="ta-link-form">
      <select className={styles.statusSelect} aria-label={t.groupPick} value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="">{t.groupPlaceholder}</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name} · {t.students(g.students)}</option>)}
      </select>
      <select className={styles.statusSelect} aria-label={t.target} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">{t.targetNew}</option>
        {freeClasses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <Button variant="outline" loading={busy} disabled={!group} onClick={link}>{t.link}</Button>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </div>
  );
}
