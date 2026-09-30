import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Collapsible from '../../components/ui/Collapsible';
import Select from '../../components/ui/Select';
import { addCourseLanguage, removeCourseLanguage } from './contentApi';
import { courseLanguages as t, languages as names } from '../../i18n/he';
import styles from './content.module.css';

const SUPPORTED = ['java', 'csharp'];   // C1: Java + C#. The schema allows more; the UI offers what is implemented.

// Which programming languages a (programming) course supports. Primary is fixed; others can be added / removed.
export default function CourseLanguagesPanel({ course, languages, onChanged }) {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addable = SUPPORTED.filter((l) => !languages.includes(l));

  async function add() {
    setBusy(true); setError('');
    const { error: err } = await addCourseLanguage(course.id, choice || addable[0]);
    setBusy(false);
    if (err) return setError(t.addError);
    setChoice('');
    onChanged();
  }

  async function remove(lang) {
    setBusy(true); setError('');
    const { error: err } = await removeCourseLanguage(course.id, lang);
    setBusy(false);
    if (err) return setError(err.code === '23503' ? t.inUse : t.removeError);
    onChanged();
  }

  return (
    <Collapsible title={t.title} headingLevel={2} className={styles.panelCollapsible}
      storageKey={`course:${course.id}:languages`} defaultOpen={false}
      meta={languages.map((l) => names[l] ?? l).join(' · ')}>
      <p className={styles.muted}>{t.explain}</p>
      <ul className={styles.simpleList}>
        {languages.map((l) => (
          <li key={l} className={styles.simpleRow}>
            <span>{names[l] ?? l} {l === course.programming_language && <Badge tone="lavender">{t.primary}</Badge>}</span>
            {l !== course.programming_language && (
              <Button variant="ghost" icon={X} disabled={busy} onClick={() => remove(l)}>{t.remove}</Button>
            )}
          </li>
        ))}
      </ul>
      {addable.length > 0 ? (
        <div className={styles.enrollForm}>
          <Select label={t.choose} value={choice || addable[0]} onChange={(e) => setChoice(e.target.value)}
            options={addable.map((l) => ({ value: l, label: names[l] ?? l }))} />
          <Button icon={Plus} loading={busy} onClick={add}>{t.add}</Button>
        </div>
      ) : <p className={styles.muted}>{t.none}</p>}
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </Collapsible>
  );
}
