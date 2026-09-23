import { app } from '../../i18n/he';
import styles from './Logo.module.css';

// Brand mark = a Node as drawn in class: [ value | next ]
export default function Logo({ size = 'md' }) {
  return (
    <span className={`${styles.logo} ${styles[size]}`}>
      <span className={styles.node} aria-hidden="true">
        <span className={styles.value} />
        <span className={styles.next}><span className={styles.dot} /></span>
      </span>
      <span className={styles.word}>{app.name}</span>
    </span>
  );
}
