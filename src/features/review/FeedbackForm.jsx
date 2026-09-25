import { useState } from 'react';
import { AlertTriangle, CheckCircle2, EyeOff, Lock, Save, Tags } from 'lucide-react';
import Button from '../../components/ui/Button';
import TextArea from '../../components/ui/TextArea';
import MarkdownField from '../../components/markdown/MarkdownField';
import Markdown from '../../components/markdown/Markdown';
import VerdictPicker from './VerdictPicker';
import { useAutosave } from '../workspace/useAutosave';
import { buildTree, flattenTree } from '../../lib/topicTree';
import { saveFeedbackDraft, saveFeedbackMetadata } from './reviewApi';
import { common, formatDateTime, formatTime, review as t, verdictLabels } from '../../i18n/he';
import styles from './review.module.css';

// Mirrors decision 62 (the database enforces it again on release).
export const isReady = (v) => Boolean(v.verdict) && (v.verdict === 'correct' || v.message.trim() !== '');

const serialize = (mode, v) => JSON.stringify(mode === 'draft'
  ? { verdict: v.verdict, message: v.message, note: v.note, tags: [...v.tags].sort(), ret: v.ret }
  : { note: v.note, tags: [...v.tags].sort() });

// mode 'draft'    → feedback not released: full draft via save_feedback
// mode 'metadata' → feedback released: verdict/message read-only (decision 61);
//                   private note + tags via save_feedback_metadata (decision 68)
export default function FeedbackForm({ submission, initial, server, tags, topics, solutionSeen, onChange, onSaved, onConflict }) {
  const fb = submission.feedback;
  const mode = fb?.released_at ? 'metadata' : 'draft';
  const [v, setV] = useState(initial);
  const [preview, setPreview] = useState(false);

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
            <VerdictPicker value={v.verdict} onChange={(verdict) => set({ verdict })} label={t.verdict} />
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
          <label className={styles.returnBox}>
            <input type="checkbox" checked={v.ret} onChange={(e) => set({ ret: e.target.checked })} />
            <span>
              <strong>{t.returnIntent}</strong>
              <span className={styles.muted}> – {t.returnIntentHint}</span>
            </span>
          </label>
          {v.ret && solutionSeen && (
            <p className={styles.warning} role="alert"><AlertTriangle size={16} aria-hidden="true" /> {t.solutionSeenWarning}</p>
          )}
          <p className={ready ? styles.readyOk : styles.readyNo} role="status">
            {ready ? <><CheckCircle2 size={16} aria-hidden="true" /> {t.ready}</>
              : !v.verdict ? t.missingVerdict : t.missingMessage}
          </p>
          <p className={styles.note}>{t.releaseLater}</p>
        </>
      )}

      <div className={styles.formActions}>
        <Button variant="secondary" icon={Save} onClick={() => flush()} disabled={status === 'saving'}>{mode === 'draft' ? t.saveDraft : common.save}</Button>
      </div>
    </section>
  );
}
