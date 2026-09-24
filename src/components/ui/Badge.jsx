import styles from './Badge.module.css';

// tone: lavender | sky | mint | peach | butter | rose | neutral
export default function Badge({ tone = 'neutral', icon: Icon, children }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </span>
  );
}
