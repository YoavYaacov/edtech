import { app } from '../../i18n/he';
import symbolUrl from '../../assets/brand/hevanti-symbol-tight.svg';
import styles from './Logo.module.css';

// Brand lockup "הבנתי" — master logo A (Rubik 700 name / Rubik 400 slogan).
// All dimensions are in em, relative to the name's font size, so every size
// is the same lockup scaled (see .logo in Logo.module.css).
//   variant="full"    stacked: symbol above name above slogan (Login)
//   variant="compact" horizontal: symbol + name, no slogan (sidebar, mobile header)
//   size: sm | md | lg  (sets the name's font size only)
// The symbol is decorative (the name is real text next to it).
export default function Logo({ variant = 'compact', size = 'md' }) {
  const full = variant === 'full';
  return (
    <span className={`${styles.logo} ${full ? styles.full : styles.compact} ${styles[size]}`}>
      <img className={styles.symbol} src={symbolUrl} alt="" aria-hidden="true" draggable="false" />
      <span className={styles.text}>
        <span className={styles.word}>{app.name}</span>
        {full && <span className={styles.slogan}>{app.tagline}</span>}
      </span>
    </span>
  );
}
