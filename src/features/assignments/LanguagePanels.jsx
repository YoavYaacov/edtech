import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Plus, Sparkles } from 'lucide-react';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import { updateAssignment } from './assignmentsApi';
import { assignmentLanguage as al, languages as names } from '../../i18n/he';
import styles from './assignments.module.css';

// Draft only: the assignment's single language (locked at publish by the database).
export function LanguagePanel({ assignment, languages, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(lang) {
    setBusy(true); setError('');
    const { error: err } = await updateAssignment(assignment.id, { programming_language: lang });
    setBusy(false);
    if (err) setError(String(err.message ?? '').includes('recipient_language_mismatch') ? al.changeError : al.saveError);
    onChanged();
  }

  return (
    <section className={styles.panel} aria-labelledby="lang-title">
      <h2 id="lang-title" className={styles.panelTitle}>{al.label}</h2>
      <p className={styles.muted}>{al.hint}</p>
      <div className={styles.langSelect}>
        <Select label={al.label} value={assignment.programming_language ?? ''} disabled={busy}
          onChange={(e) => change(e.target.value)}
          options={languages.map((l) => ({ value: l, label: names[l] ?? l }))} />
      </div>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </section>
  );
}

// Lists the questions that block publishing in the assignment's language, each with a way to fix it.
// AI proposals arrive in a later round (C2): the button is a disabled placeholder.
export function BlockersPanel({ status }) {
  if (!status?.language) return null;
  const lang = names[status.language] ?? status.language;
  const blocked = (status.items ?? []).filter((i) => i.status !== 'ok');
  if (blocked.length === 0) {
    return <p className={styles.langOk} role="status"><CheckCircle2 size={18} aria-hidden="true" />{al.allGood}</p>;
  }
  return (
    <section className={`${styles.panel} ${styles.blockers}`} aria-labelledby="blockers-title">
      <h2 id="blockers-title" className={styles.panelTitle}><AlertTriangle size={18} aria-hidden="true" />{al.blockersTitle(lang)}</h2>
      <p className={styles.muted}>{al.blockersIntro}</p>
      <ul className={styles.blockerList}>
        {blocked.map((i) => (
          <li key={i.assignment_question_id} className={styles.blockerRow}>
            <div>
              <strong>{i.title}</strong>
              <p className={styles.muted}>{al[i.status]?.(lang) ?? al.missing_variant(lang)}</p>
            </div>
            <span className={styles.blockerBtns}>
              {i.status === 'missing_variant' && (
                <Link to={`/teacher/questions/${i.question_id}?variant=${status.language}`} className={styles.linkBtn}>
                  <Plus size={16} aria-hidden="true" />{al.createManual}
                </Link>
              )}
              {i.status === 'unclassified' && (
                <Link to={`/teacher/questions/${i.question_id}`} className={styles.linkBtn}>{al.createManual}</Link>
              )}
              <Button variant="ghost" icon={Sparkles} disabled title={al.aiSoon}>{al.suggestAi} ({al.aiSoon})</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
