import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Collapsible from '../../components/ui/Collapsible';
import { LoadingState } from '../../components/ui/States';
import CodeEditor from '../../components/code/CodeEditor';
import MarkdownField from '../../components/markdown/MarkdownField';
import { deleteQuestionVariant, fetchQuestionVariants, saveQuestionVariant } from './questionsApi';
import { languages as names, variants as t } from '../../i18n/he';
import styles from './questions.module.css';

const hintOf = (hints, level) => (Array.isArray(hints) ? hints.find((h) => h.level === level)?.content_md ?? '' : '');

function VariantForm({ questionId, language, existing, baseHints, onSaved, onCancel }) {
  const [v, setV] = useState({
    body_md: existing?.body_md ?? '',
    starter_code: existing?.starter_code ?? '',
    solution_code: existing?.solution_code ?? '',
    explanation_md: existing?.explanation_md ?? '',
    // hints: a new variant is prefilled with the base's hints (editable); an existing one keeps its own override
    hint1: existing ? hintOf(existing.hints, 1) : baseHints[0] ?? '',
    hint2: existing ? hintOf(existing.hints, 2) : baseHints[1] ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));

  async function save() {
    setBusy(true); setError('');
    const hints = [];
    if (v.hint1.trim()) hints.push({ level: 1, content_md: v.hint1 });
    if (v.hint2.trim()) hints.push({ level: hints.length + 1, content_md: v.hint2 });
    const { error: err } = await saveQuestionVariant(questionId, {
      language, body_md: v.body_md, starter_code: v.starter_code, solution_code: v.solution_code,
      explanation_md: v.explanation_md, hints: hints.length ? hints : null,
      origin: existing?.origin === 'ai_proposed' ? 'ai_proposed_edited' : existing?.origin ?? 'manual',
    });
    setBusy(false);
    if (err) return setError(t.saveError);
    onSaved();
  }

  return (
    <div className={styles.variantForm}>
      <MarkdownField label={t.body} rows={4} value={v.body_md} onChange={set('body_md')} />
      <div className={styles.codeField}>
        <span className={styles.fieldLabel}>{t.starter}</span>
        <CodeEditor value={v.starter_code} onChange={set('starter_code')} language={language} label={t.starter} minHeight="120px" />
      </div>
      <div className={styles.codeField}>
        <span className={styles.fieldLabel}>{t.solution}</span>
        <CodeEditor value={v.solution_code} onChange={set('solution_code')} language={language} label={t.solution} />
      </div>
      <MarkdownField label={t.explanation} rows={3} value={v.explanation_md} onChange={set('explanation_md')} />
      <div className={styles.grid2}>
        <MarkdownField label={t.hint1} rows={3} value={v.hint1} onChange={set('hint1')} />
        <MarkdownField label={t.hint2} rows={3} value={v.hint2} onChange={set('hint2')} />
      </div>
      {error && <p className={styles.saveError} role="alert">{error}</p>}
      <div className={styles.variantActions}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{t.cancel}</Button>
        <Button icon={Check} loading={busy} onClick={save}>{busy ? t.saving : t.save}</Button>
      </div>
    </div>
  );
}

// Manual variants of a saved question, one row per OTHER language of the course.
// baseLanguage: the language the base question is written in.
export default function VariantsPanel({ questionId, languages, baseLanguage, baseHints, onChanged, focusLanguage }) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(focusLanguage ?? null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data, error: err } = await fetchQuestionVariants(questionId);
    if (err) setError(t.saveError); else setRows(data ?? []);
    onChanged?.(data ?? []);
  }
  useEffect(() => { load(); }, [questionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (focusLanguage) setEditing(focusLanguage); }, [focusLanguage]);

  const others = languages.filter((l) => l !== baseLanguage);
  if (others.length === 0) return null;

  async function remove(row) {
    setError('');
    const { error: err } = await deleteQuestionVariant(row.id);
    if (err) return setError(t.deleteError);
    setEditing(null);
    load();
  }

  return (
    <Collapsible title={t.title} headingLevel={2} className={styles.panelCollapsibleEditor}
      storageKey={`variants:${questionId}`} defaultOpen forceOpen={editing != null}>
      <p className={styles.muted}>{t.explain}</p>
      {rows === null ? <LoadingState /> : (
        <ul className={styles.variantList}>
          {others.map((lang) => {
            const row = rows.find((r) => r.programming_language === lang);
            return (
              <li key={lang} className={styles.variantRow}>
                <div className={styles.variantHead}>
                  <strong>{names[lang] ?? lang}</strong>
                  <Badge tone={row ? 'mint' : 'butter'}>{row ? t.has : t.missing}</Badge>
                  <span className={styles.variantBtns}>
                    {editing !== lang && (
                      <Button variant="secondary" icon={row ? Pencil : Plus} onClick={() => { setMessage(''); setEditing(lang); }}>
                        {row ? t.edit : t.create}
                      </Button>
                    )}
                    {row && editing !== lang && (
                      <Button variant="dangerGhost" icon={Trash2} onClick={() => remove(row)}>{t.delete}</Button>
                    )}
                  </span>
                </div>
                {editing === lang && (
                  <VariantForm questionId={questionId} language={lang} existing={row} baseHints={baseHints}
                    onCancel={() => setEditing(null)}
                    onSaved={() => { setEditing(null); setMessage(t.saved); load(); }} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {message && <p className={styles.successNote} role="status">{message}</p>}
      {error && <p className={styles.saveError} role="alert">{error}</p>}
    </Collapsible>
  );
}
