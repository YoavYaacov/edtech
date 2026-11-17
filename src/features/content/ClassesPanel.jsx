import { useState } from 'react';
import { Link2, Trash2, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Collapsible from '../../components/ui/Collapsible';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import JoinLinkPanel from '../classes/JoinLinkPanel';
import { createClass, deleteClass, fetchEnrollments, setClassMember } from './contentApi';
import { useAsync } from '../../lib/useAsync';
import { classes as t, errors } from '../../i18n/he';
import styles from './content.module.css';

// Class management inside a subject; join links (batch 4) and the board (batch 5) hang off the same classes.
export default function ClassesPanel({ courseId, classes, onChanged }) {
  const enrolled = useAsync(() => fetchEnrollments(courseId), [courseId]);
  const [name, setName] = useState('');
  const [pick, setPick] = useState({}); // classId -> studentId
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [del, setDel] = useState(null); // class pending deletion
  const [linkOpen, setLinkOpen] = useState({}); // classId -> join link panel shown

  const students = (enrolled.data ?? []).map((e) => e.student).filter(Boolean);
  const nameOf = (id) => students.find((s) => s.id === id)?.full_name ?? '—';

  async function run(fn) {
    setBusy(true); setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) { setError(errors.generic); return false; }
    await onChanged();
    return true;
  }

  return (
    <Collapsible title={t.title} headingLevel={2} className={styles.panelCollapsible}
      storageKey={`course:${courseId}:classes`} defaultOpen={false}>
      <p className={styles.muted}>{t.explain}</p>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      <ul className={styles.classList}>
        {classes.map((c) => {
          const memberIds = c.members.map((m) => m.student_id);
          return (
            <li key={c.id} className={styles.classCard}>
              <div className={styles.classHead}>
                <span className={styles.className}>{c.title}</span>
                <span className={styles.muted}>{t.members(memberIds.length)}</span>
                <button type="button" className={styles.iconBtn} title={t.deleteClass} aria-label={`${t.deleteClass}: ${c.title}`}
                  disabled={busy} onClick={() => setDel(c)}><Trash2 size={16} /></button>
              </div>
              {memberIds.length === 0 ? <p className={styles.muted}>{t.noMembers}</p> : (
                <ul className={styles.memberList}>
                  {memberIds.map((id) => (
                    <li key={id} className={styles.memberChip}>
                      {nameOf(id)}
                      <button type="button" className={styles.iconBtn} title={t.remove} aria-label={`${t.remove}: ${nameOf(id)}`}
                        disabled={busy} onClick={() => run(() => setClassMember(c.id, id, false))}><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
              {students.length > 0 && (
                <div className={styles.classHead}>
                  <select className={styles.statusSelect} aria-label={t.addMember} value={pick[c.id] ?? ''}
                    onChange={(e) => setPick((p) => ({ ...p, [c.id]: e.target.value }))}>
                    <option value="">{t.pickStudent}</option>
                    {students.filter((s) => !memberIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                  <Button variant="outline" disabled={!pick[c.id] || busy}
                    onClick={async () => { if (await run(() => setClassMember(c.id, pick[c.id], true))) setPick((p) => ({ ...p, [c.id]: '' })); }}>
                    {t.addMember}
                  </Button>
                </div>
              )}
              <div className={styles.classHead}>
                <Button variant="outline" icon={Link2} aria-expanded={!!linkOpen[c.id]}
                  onClick={() => setLinkOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}>{t.joinLinkToggle}</Button>
              </div>
              {linkOpen[c.id] && <JoinLinkPanel classId={c.id} />}
            </li>
          );
        })}
      </ul>
      {students.length > 0 && <p className={styles.muted}>{t.moveNote}</p>}
      {enrolled.status === 'ready' && students.length === 0 && <p className={styles.muted}>{t.noEnrolled}</p>}
      <form className={styles.inlineForm} onSubmit={async (e) => { e.preventDefault(); if (name.trim() && await run(() => createClass(courseId, name.trim()))) setName(''); }}>
        <input className={styles.inlineInput} value={name} maxLength={120} placeholder={t.newPlaceholder} aria-label={t.newPlaceholder}
          onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="outline" loading={busy} disabled={!name.trim()}>{t.add}</Button>
      </form>
      <ConfirmDialog open={!!del} danger busy={busy} title={del ? t.deleteTitle(del.title) : ''}
        body={del ? t.deleteBody(del.members.length) : ''} confirmLabel={t.deleteConfirm}
        onCancel={() => setDel(null)}
        onConfirm={async () => { const id = del.id; if (await run(() => deleteClass(id))) setDel(null); }} />
    </Collapsible>
  );
}
