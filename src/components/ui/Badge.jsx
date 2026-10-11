import styles from './Badge.module.css';

// tone: lavender | sky | mint | peach | butter | rose | neutral
// R1B-3: ONE compact size for every tag (difficulty, source, type, status, coverage…). Colour carries the meaning,
// never the dimensions: fixed height, padding, font size/weight, line-height and radius live in Badge.module.css.
export default function Badge({ tone = 'neutral', icon: Icon, children }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      <span className={styles.text}>{children}</span>
    </span>
  );
}
