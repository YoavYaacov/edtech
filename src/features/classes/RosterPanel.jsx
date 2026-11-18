import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import { useAsync } from '../../lib/useAsync';
import { rosterAdd, rosterList, rosterRemove } from './classesApi';
import { parseRosterText, rowsToText } from './rosterText';
import { readRosterFile } from './fileRows';
import { errors, roster as t } from '../../i18n/he';
import styles from '../content/content.module.css';

// The class roster (teacher): who is expected to join through the link. IDs are only typed in here; afterwards the
// teacher sees them masked, and students never see them.
export default function RosterPanel({ classId }) {
  const list = useAsync(() => rosterList(classId), [classId]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState([]); // [{kind:'ok'|'error', text}]
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setMsgs([]);
    try {
      setText(rowsToText(await readRosterFile(file)));
    } catch (err) {
      setError(t.fileErrors[err.message] ?? t.fileErrors.read);
    }
  }

  async function add() {
    setError(''); setMsgs([]);
    const { rows, problems } = parseRosterText(text);
    const out = problems.map((p) => ({ kind: 'error', text: t.lineError(p.line, t.rowErrors[p.reason]) }));
    if (rows.length === 0) { setMsgs(out); return; }
    setBusy(true);
    // the server takes up to 300 rows per call
    let added = 0;
    for (let at = 0; at < rows.length; at += 300) {
      const part = rows.slice(at, at + 300);
      const { data, error: err } = await rosterAdd(classId, part.map((r) => ({ first: r.first, last: r.last, id: r.id })));
      if (err) { setBusy(false); setError(errors.generic); return; }
      for (const e of data.errors ?? []) out.push({ kind: 'error', text: t.lineError(part[e.row - 1].line, t.rowErrors[e.reason] ?? errors.generic) });
      added += data.added ?? 0;
    }
    setBusy(false);
    if (added > 0) out.unshift({ kind: 'ok', text: t.added(added) });
    setMsgs(out);
    // keep only the lines that did not make it, so the teacher can fix and resend them
    const failed = new Set(out.filter((m) => m.kind === 'error').map((m) => Number(/\d+/.exec(m.text)?.[0])));
    setText(text.split(/\r?\n/).filter((_, i) => failed.has(i + 1)).join('\n'));
    await list.reload();
  }

  async function remove(id) {
    setBusy(true);
    const { error: err } = await rosterRemove(id);
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    await list.reload();
  }

  const items = list.data ?? [];
  return (
    <div data-testid={`roster-${classId}`}>
      <strong>{t.title}</strong>
      <p className={styles.muted}>{t.explain}</p>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      <textarea className={styles.inlineInput} style={{ width: '100%', minHeight: 90 }} dir="auto" value={text}
        aria-label={t.title} placeholder={t.placeholder} onChange={(e) => setText(e.target.value)} />
      <div className={styles.classHead}>
        <Button variant="outline" loading={busy} disabled={!text.trim()} onClick={add}>{busy ? t.adding : t.add}</Button>
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} aria-hidden="true" /> {t.upload}</Button>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.csv,.tsv,.txt" aria-label={t.upload} onChange={onFile} />
      </div>
      {msgs.map((m, i) => (
        <p key={i} className={m.kind === 'ok' ? styles.muted : styles.errorNote} role={m.kind === 'ok' ? 'status' : 'alert'}>{m.text}</p>
      ))}
      {list.status === 'ready' && items.length === 0 && <p className={styles.muted}>{t.empty}</p>}
      {items.length > 0 && (
        <ul className={styles.memberList}>
          {items.map((r) => (
            <li key={r.id} className={styles.memberChip}>
              {r.first_name} {r.last_name} · <span dir="ltr">{r.id_masked}</span> · {r.claimed ? t.status.claimed : t.status.waiting}
              {!r.claimed && (
                <button type="button" className={styles.iconBtn} title={t.remove} aria-label={`${t.remove}: ${r.first_name} ${r.last_name}`}
                  disabled={busy} onClick={() => remove(r.id)}><X size={14} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
