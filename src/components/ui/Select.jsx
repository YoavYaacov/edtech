import { useId } from 'react';
import styles from './TextField.module.css';

// options: [{ value, label }]
export default function Select({ label, options, placeholder, hint, ...props }) {
  const id = useId();
  return (
    <div className={styles.field}>
      {label && <label htmlFor={id} className={styles.label}>{label}</label>}
      <select id={id} className={`${styles.input} ${styles.select}`} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
