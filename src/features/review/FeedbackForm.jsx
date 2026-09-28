import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, EyeOff, Lock, RotateCcw, Save, Tags } from 'lucide-react';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Button from '../../components/ui/Button';
import TextArea from '../../components/ui/TextArea';
import MarkdownField from '../../components/markdown/MarkdownField';
import Markdown from '../../components/markdown/Markdown';
import VerdictPicker from './VerdictPicker';
import { useAutosave } from '../workspace/useAutosave';
import { buildTree, flattenTree } from '../../lib/topicTree';
import { returnForRevision, saveFeedbackDraft, saveFeedbackMetadata } from './reviewApi';
import { common, errors, formatDateTime, formatTime, release as rl, review as t, verdictLabels } from '../../i18n/he';
import styles from './review.module.css';

// Mirrors decision 62 (the database enforces it again on release).
export const isReady = (v) => Boolean(v.verdict) && (v.verdict === 'correct' || v.message.trim() !== '');

const serialize = (mode, v) => JSON.stringify(mode === 'draft'
  ? { verdict: v.verdict, message: v.message, note: v.note, tags: [...v.tags].sort(), ret: v.ret }
  : { note: v.note, tags: [...v.tags].sort() });

// mode 'draft'    → feedback not released: full draft via save_feedback
// mode 'metadata' → feedback released: verdict/message read-only (decision 61);
//                   private note + tags via save_feedback_metadata (decision 68)
export default function FeedbackForm({ submission, initial, server, tags, topics, solutionSeen, onChange, onSaved, onConflict,
  isLatest, answerStatus, assignmentStatus, registerFlush, onDone }) {
  const fb = submission.feedback;
  const mode = fb?.released_at ? 'metadata' : 'draft';
  const [v, setV] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState(false); // late-return confirm only (decision 1: no per-question release anymore)
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const value = serialize(mode, v);
  const { status, savedAt, flush } = useAutosave({
    value,
    serverValue: server ?? serialize(mode, initial),
    save: async (raw) => {
      const payload = { ...v, ...JSON.parse(raw) };
      const { data, error } = mode === 'draft'
        ? await saveFeedbackDraft(submission.id, payload)
        : await saveFeedbackMetadata(submission.id, payload);
      if (error) return { data: null, error };
      if (!data?.ok) { onConflict(data?.reason); return { data: new Date().toISOString(), error: null }; }
      return { data: new Date().toISOString(), error: null };
    },
    onSaved: (raw) => onSaved(raw),
  });

  // the page can flush this draft before computing/sending Student × Assignment readiness
  useEffect(() => {
    registerFlush?.(flush);
    return () => registerFlush?.(null);
  }, [flush, registerFlush]);

  // Step 5 — release to the student is now a Student × Assignment action on
  // ReviewPage (decision 1); this form only authors/saves the draft. Late
  // return of already-released feedback is the one exception that stays here.
  const canLateReturn = mode === 'metadata' && isLatest && answerStatus === 'submitted' && !fb.return_for_revision;

  async function doReturn() {
    setBusy(true);
    const { data, error } = await returnForRevision(submission.id);
    setBusy(false);
    setConfirm(false);
    if (error) return setActionError(errors.generic);
    if (!data?.ok) return setActionError(rl.reasons[data?.reason] ?? errors.generic);
    onDone(rl.returned);
  }

  function set(patch) {
    const next = { ...v, ...patch };
    setV(next);
    onChange(next);
  }
  const toggleTag = (id) => set({ tags: v.tags.includes(id) ? v.tags.filter((x) => x !== id) : [...v.tags, id] });

  // tag groups: general first, then topics in tree order; archived tags only if attached
  const offered = tags.filter((x) => !x.is_archived || v.tags.includes(x.id));
  const groups = [
    { key: 'general', title: t.tagsGeneral, items: offered.filter((x) => !x.topic_id) },
    ...flattenTree(buildTree(topics)).map((tp) => ({ key: tp.id, title: tp.title, items: offered.filter((x) => x.topic_id === tp.id) })),
  ].filter((g) => g.items.length);

  const saveText = status === 'saved' && savedAt ? t.save.saved(formatTime(savedAt)) : t.save[status] ?? '';
  const ready = isReady(v);

  return (
    <section className={styles.formCard} aria-labelledby="fb-title">
      <div className={styles.formHead}>
        <h2 id="fb-title" className={styles.formTitle}>{t.feedbackTitle} · {t.attempt(submission.attempt_number)}</h2>
        <span className={styles.saveState} data-state={status} role="status" aria-live="polite">{saveText}</span>
      </div>

      {mode === 'metadata' && (
        <div className={styles.releasedBox}>
          <p className={styles.releasedLine}><Lock size={15} aria-hidden="true" /> {t.released(formatDateTime(fb.released_at))}</p>
          {fb.returned_at && <p className={styles.muted}>{t.returnedAt(formatDateTime(fb.returned_at))}</p>}
          <p className={styles.verdictReadonly} data-verdict={fb.verdict}>{t.verdict}: <strong>{verdictLabels[fb.verdict]}</strong></p>
          <Markdown empty={null}>{fb.message_md}</Markdown>
          <p className={styles.muted}>{t.metadataEditable}</p>
        </div>
      )}

      {mode === 'draft' && (
        <>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t.verdict}</span>
            {/* Round 6 Production fix (section 6): "לתיקון" is now itself the
                decision to return the question for another attempt — there is
                no longer a second, separate checkbox. ret is derived from the
                verdict alone, in this one place, so it can never drift out of
                sync with it (including for a draft loaded from a previous
                session — see ReviewPage.initialForms). */}
            <VerdictPicker value={v.verdict} onChange={(verdict) => set({ verdict, ret: verdict === 'needs_fix' })} label={t.verdict} />
          </div>
          <MarkdownField label={t.message} hint={t.messageHint} rows={5} value={v.message}
            onChange={(e) => set({ message: e.target.value })} />
          <button type="button" className={styles.linkBtn} aria-expanded={preview} onClick={() => setPreview((p) => !p)}>
            {t.previewToggle}
          </button>
          {preview && <div className={styles.preview}><Markdown empty={<p className={styles.muted}>—</p>}>{v.message}</Markdown></div>}
        </>
      )}

      <div className={styles.privateBox}>
        <span className={styles.fieldLabel}><EyeOff size={15} aria-hidden="true" /> {t.privateNote}</span>
        <TextArea rows={3} value={v.note} onChange={(e) => set({ note: e.target.value })} aria-label={t.privateNote} hint={t.privateNoteHint} />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}><Tags size={15} aria-hidden="true" /> {t.tags}</span>
        <p className={styles.muted}>{t.tagsHint}</p>
        {groups.length === 0 && <p className={styles.muted}>{t.tagsEmpty}</p>}
        {groups.map((g) => (
          <div key={g.key} className={styles.tagGroup}>
            <span className={styles.tagGroupTitle}>{g.title}</span>
            <div className={styles.chips}>
              {g.items.map((tag) => (
                <button key={tag.id} type="button" aria-pressed={v.tags.includes(tag.id)}
                  className={`${styles.chip} ${v.tags.includes(tag.id) ? styles.chipOn : ''}`} onClick={() => toggleTag(tag.id)}>
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {mode === 'draft' && (
        <>
          {/* Round 6 Production fix (section 6): no more independent "להחזיר
              לתלמיד" checkbox — a plain, non-interactive note explains what
              choosing "לתיקון" already does, above, on its own. */}
          {v.verdict === 'needs_fix' && <p className={styles.muted}>{t.needsFixReturnNote}</p>}
          {v.ret && solutionSeen && (
            <p className={styles.warning} role="alert"><AlertTriangle size={16} aria-hidden="true" /> {t.solutionSeenWarning}</p>
          )}
          <p className={ready ? styles.readyOk : styles.readyNo} role="status">
            {ready ? <><CheckCircle2 size={16} aria-hidden="true" /> {t.ready}</>
              : !v.verdict ? t.missingVerdict : t.missingMessage}
          </p>
        </>
      )}

      {actionError && <p className={styles.warning} role="alert">{actionError}</p>}
      {/* Round 6 (decision 101+, section C): the manual "שמירת טיוטה" button is
          gone in draft mode — Production proved the same useAutosave mechanism
          above already saves reliably across question/app navigation and
          refresh, with its own "נשמר HH:MM" indicator, so a manual flush button
          added nothing. Kept here only in metadata mode (editing the private
          note/tags of already-released feedback), a less-tested flow the user
          did not ask to change. */}
      {mode === 'metadata' && (
        <div className={styles.formActions}>
          <Button variant="secondary" icon={Save} onClick={() => flush()} disabled={status === 'saving' || busy}>{common.save}</Button>
          {canLateReturn && (
            <Button variant="secondary" icon={RotateCcw} onClick={() => { setActionError(''); setConfirm(true); }} disabled={busy}>
              {rl.lateReturn}
            </Button>
          )}
        </div>
      )}

      {confirm && (
        <ConfirmDialog open busy={busy} onConfirm={doReturn} onCancel={() => setConfirm(false)}
          title={rl.lateReturnTitle} confirmLabel={rl.lateReturn}
          body={(
            <span className={styles.bulkList}>
              <span>{rl.lateReturnBody}</span>
              {solutionSeen && <strong>{t.solutionSeenWarning}</strong>}
              {assignmentStatus !== 'published' && <strong>{rl.reasons.closed_no_return}</strong>}
            </span>
          )} />
      )}
    </section>
  );
}
