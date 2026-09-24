import { useState } from 'react';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import TextArea from '../../components/ui/TextArea';
import Select from '../../components/ui/Select';
import { common, courses as t, errors, languages } from '../../i18n/he';
import styles from './content.module.css';

const languageOptions = Object.entries(languages).map(([value, label]) => ({ value, label }));

export default function CourseForm({ initial, submitLabel, busyLabel, onSubmit, onCancel }) {
  const [values, setValues] = useState({
    title: initial?.title ?? '',
    code: initial?.code ?? '',
    description: initial?.description ?? '',
    programming_language: initial?.programming_language ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!values.title.trim()) return setError(t.titleRequired);
    setBusy(true);
    setError('');
    const { error: err } = await onSubmit({
      title: values.title.trim(),
      code: values.code.trim(),
      description: values.description.trim(),
      programming_language: values.programming_language || null,
    });
    setBusy(false);
    if (err) setError(errors.generic);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.formGrid}>
        <TextField label={t.courseTitle} required value={values.title} onChange={set('title')} maxLength={200} />
        <TextField label={t.code} hint={t.codeHint} value={values.code} onChange={set('code')} maxLength={40} dir="ltr" />
        <Select label={t.language} placeholder={t.noLanguage} options={languageOptions}
          value={values.programming_language} onChange={set('programming_language')} />
      </div>
      <TextArea label={t.description} rows={2} value={values.description} onChange={set('description')} maxLength={4000} />
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      <div className={styles.formActions}>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>{common.cancel}</Button>}
        <Button type="submit" loading={busy}>{busy ? busyLabel : submitLabel}</Button>
      </div>
    </form>
  );
}
