import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Select from '../../components/ui/Select';
import TextField from '../../components/ui/TextField';
import { LoadingState } from '../../components/ui/States';
import { showToast } from '../../components/ui/Toast';
import { assignmentClonePreflight, cloneAssignmentToLanguage } from './assignmentsApi';
import { cloneAssignment as t, languages as names } from '../../i18n/he';
import styles from './assignments.module.css';

const KIND_TEXT = (k) => (k === 'archived' ? t.archivedItem : k === 'unclassified' ? t.unclassifiedItem : null);

// C3. "Clone to another programming language": a NEW DRAFT in the target language — same questions and order, same policies,
// NO recipients, NO submissions, nothing of the source changes. All-or-nothing: if any question has no content in the target
// language nothing is created, and the missing questions are listed with a link to fix each one. No AI runs here.
export default function CloneAssignmentDialog({ assignment, languages, onClose }) {
  const navigate = useNavigate();
  const targets = languages.filter((l) => l !== assignment.programming_language);
  const [target, setTarget] = useState(targets[0] ?? '');
  const langName = names[target] ?? target;
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [pre, setPre] = useState({ phase: 'loading' }); // loading | ok | blocked{items} | refused{reason} | error
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inflight = useRef(false);

  // default title follows the chosen language until the teacher edits it
  useEffect(() => {
    if (!titleTouched) setTitle(t.defaultTitle(assignment.title, langName).slice(0, 200));
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!target) return undefined;
    let cancelled = false;
    setPre({ phase: 'loading' }); setError('');
    (async () => {
      try {
        const { data, error: err } = await assignmentClonePreflight(assignment.id, target);
        if (cancelled) return;
        if (err || !data) return setPre({ phase: 'error' });
        if (data.ok) return setPre({ phase: 'ok' });
        if (data.reason === 'variants_missing') return setPre({ phase: 'blocked', items: data.items ?? [] });
        return setPre({ phase: 'refused', reason: data.reason });
      } catch { if (!cancelled) setPre({ phase: 'error' }); }
    })();
    return () => { cancelled = true; };
  }, [assignment.id, target]);

  async function confirm() {
    if (inflight.current || pre.phase !== 'ok') return; // double-click guard
    inflight.current = true; setBusy(true); setError('');
    try {
      const { data, error: err } = await cloneAssignmentToLanguage(assignment.id, target, title.trim());
      if (err || !data) { setError(t.error); return; }
      if (!data.ok) {
        // the world changed between preflight and clone (e.g. a variant was deleted): nothing was created
        if (data.reason === 'variants_missing') setPre({ phase: 'blocked', items: data.items ?? [] });
        else setPre({ phase: 'refused', reason: data.reason });
        return;
      }
      showToast(t.created(langName));
      onClose();
      navigate(`/teacher/assignments/${data.assignment_id}`);
    } catch { setError(t.error); } finally { inflight.current = false; setBusy(false); }
  }

  const items = pre.phase === 'blocked' ? pre.items : [];
  return (
    <ConfirmDialog open title={t.title} confirmLabel={t.confirm} busy={busy} confirmDisabled={pre.phase !== 'ok' || !title.trim()}
      onConfirm={confirm} onCancel={() => { if (!busy) onClose(); }}>
      <p className={styles.muted}>{t.intro}</p>
      <div className={styles.cloneFields}>
        <Select label={t.target} value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)}
          options={targets.map((l) => ({ value: l, label: names[l] ?? l }))} />
        <TextField label={t.titleLabel} value={title} maxLength={200} disabled={busy}
          onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }} />
      </div>
      {pre.phase === 'loading' && <LoadingState label={t.checking} />}
      {pre.phase === 'ok' && <p className={styles.langOk} role="status">{t.ok(langName)}</p>}
      {pre.phase === 'refused' && <p className={styles.errorNote} role="alert">{t.reasons[pre.reason] ?? t.error}</p>}
      {pre.phase === 'error' && <p className={styles.errorNote} role="alert">{t.error}</p>}
      {pre.phase === 'blocked' && (
        <div className={styles.errorNote} role="alert">
          <p>{items.length === 1 ? t.blockedOne(langName) : t.blocked(langName, items.length)}</p>
          <ul className={styles.cloneMissing}>
            {items.map((i) => (
              <li key={i.question_id}>
                <strong>{i.title}</strong>{KIND_TEXT(i.kind) && <span> — {KIND_TEXT(i.kind)}</span>}
                {i.kind === 'missing_variant' && (
                  <> <Link to={`/teacher/questions/${i.question_id}?variant=${target}`} onClick={onClose}>{t.fixLink}</Link></>
                )}
              </li>
            ))}
          </ul>
          <p>{t.blockedNote}</p>
        </div>
      )}
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </ConfirmDialog>
  );
}
