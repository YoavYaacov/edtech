import { useEffect, useState } from 'react';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { LoadingState } from '../../components/ui/States';
import { taApply, taPreview, taUnlink } from './classesApi';
import { errors, taSync as t } from '../../i18n/he';
import styles from '../content/content.module.css';

// Default choice per kind: add / match / rename are applied; a student who left TeacherApp is KEPT unless the
// teacher chooses to remove (removing is never the default).
// ID kinds: id_fill / id_conflict take the ID from TeacherApp (the source of truth for students who have not registered).
// A registered student's ID is never replaced automatically: id_conflict_claimed is informational only.
const DEFAULT = { add: 'apply', match: 'apply', rename: 'apply', left: 'keep', id_fill: 'apply', id_conflict: 'apply' };
const OPTIONS = { add: ['apply', 'ignore'], match: ['apply', 'ignore'], rename: ['apply', 'ignore'], left: ['keep', 'remove'], id_fill: ['apply', 'ignore'], id_conflict: ['apply', 'ignore'] };
const MANUAL = new Set(['ambiguous', 'id_conflict_claimed']);

// Sync of ONE linked class with its TeacherApp group: preview the differences, approve what you want.
export default function TaSyncPanel({ classId, groupName, onChanged, onUnlinked }) {
  const [state, setState] = useState({ status: 'loading', data: null });
  const [choice, setChoice] = useState({}); // `${kind}:${key}` -> action
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  async function load() {
    const { data, error: err } = await taPreview(classId);
    if (err || !data?.ok) { setState({ status: 'error', data: null }); return; }
    setState({ status: 'ready', data });
    setChoice({});
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [classId]);

  const items = state.data?.items ?? [];
  const actionable = items.filter((i) => !MANUAL.has(i.kind));
  const pick = (i) => choice[`${i.kind}:${i.key}`] ?? DEFAULT[i.kind];

  async function approve() {
    setBusy(true); setError(''); setMsg('');
    const decisions = actionable.map((i) => ({ kind: i.kind, key: i.key, action: pick(i) }));
    const { data, error: err } = await taApply(classId, decisions);
    setBusy(false);
    if (err || !data?.ok) { setError(errors.generic); return; }
    setMsg(t.done(data.applied, data.ignored) + (data.id_skipped ? ` ${t.idSkipped(data.id_skipped)}` : ''));
    await load();
    await onChanged?.();
  }

  async function unlink() {
    setBusy(true);
    const { error: err } = await taUnlink(classId);
    setBusy(false);
    setConfirmUnlink(false);
    if (err) { setError(errors.generic); return; }
    await onUnlinked?.();
  }

  return (
    <div data-testid={`ta-sync-${classId}`}>
      <p className={styles.muted}>{t.linkedTo(groupName)}</p>
      {state.status === 'loading' && <LoadingState label={t.syncing} />}
      {state.status === 'error' && <p className={styles.errorNote} role="alert">{errors.generic}</p>}
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      {state.status === 'ready' && items.length === 0 && <p className={styles.muted}>{t.upToDate}</p>}
      {state.status === 'ready' && items.length > 0 && (
        <ul className={styles.memberList}>
          {items.map((i) => (
            <li key={`${i.kind}:${i.key}`} className={styles.classHead}>
              <span>
                {i.kind === 'rename' ? `${i.name} ← ${i.new_name}` : i.name}
                {i.claimed && ` · ${t.joined}`}
                <span className={styles.muted}> · {t.kinds[i.kind]}</span>
              </span>
              {!MANUAL.has(i.kind) && (
                <select className={styles.statusSelect} aria-label={`${i.name}: ${t.kinds[i.kind]}`} value={pick(i)}
                  onChange={(e) => setChoice((c) => ({ ...c, [`${i.kind}:${i.key}`]: e.target.value }))}>
                  {OPTIONS[i.kind].map((a) => <option key={a} value={a}>{t.actions[i.kind][a]}</option>)}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.status === 'ready' && items.some((i) => i.kind === 'left' && pick(i) === 'remove') && <p className={styles.muted}>{t.removeNote}</p>}
      {state.status === 'ready' && state.data.ta_without_id > 0 && <p className={styles.muted}>{t.taWithoutId(state.data.ta_without_id)}</p>}
      {state.status === 'ready' && state.data.without_id > 0 && <p className={styles.muted}>{t.withoutId(state.data.without_id)}</p>}
      {msg && <p className={styles.muted} role="status">{msg}</p>}
      <div className={styles.classHead}>
        {actionable.length > 0 && <Button variant="outline" loading={busy} onClick={approve}>{busy ? t.approving : t.approve}</Button>}
        <Button variant="outline" disabled={busy} onClick={load}>{t.sync}</Button>
        <button type="button" className={styles.linkBtn} disabled={busy} onClick={() => setConfirmUnlink(true)}>{t.unlink}</button>
      </div>
      <ConfirmDialog open={confirmUnlink} busy={busy} title={t.unlinkTitle} body={t.unlinkBody} confirmLabel={t.unlinkConfirm}
        onCancel={() => setConfirmUnlink(false)} onConfirm={unlink} />
    </div>
  );
}
