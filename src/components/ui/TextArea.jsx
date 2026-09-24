import { useId } from 'react';
import styles from './TextField.module.css';

export default function TextArea({ label, error, hint, rows = 4, dir, ...props }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={styles.field}>
      {label && <label htmlFor={id} className={styles.label}>{label}</label>}
      <textarea id={id} rows={rows} dir={dir}
        className={`${styles.input} ${styles.textarea} ${error ? styles.invalid : ''}`}
        aria-invalid={error ? true : undefined} aria-describedby={hintId} {...props} />
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
