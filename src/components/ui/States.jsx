import { AlertCircle, Loader2 } from 'lucide-react';
import Button from './Button';
import { common, errors } from '../../i18n/he';
import styles from './States.module.css';

export function LoadingState({ label = common.loading, fullPage = false }) {
  return (
    <div className={`${styles.state} ${fullPage ? styles.fullPage : ''}`} role="status">
      <Loader2 className={styles.spin} size={28} aria-hidden="true" />
      <p className={styles.muted}>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry, children, fullPage = false }) {
  return (
    <div className={`${styles.state} ${styles.error} ${fullPage ? styles.fullPage : ''}`} role="alert">
      <AlertCircle size={28} aria-hidden="true" />
      <p>{message}</p>
      <div className={styles.actions}>
        {onRetry && <Button variant="secondary" onClick={onRetry}>{errors.retry}</Button>}
        {children}
      </div>
    </div>
  );
}

// tone: lavender | sky | mint | peach | butter
export function EmptyState({ icon: Icon, title, body, action, tone = 'lavender' }) {
  return (
    <div className={`${styles.state} ${styles.empty}`} data-tone={tone}>
      {Icon && <span className={styles.emptyIcon}><Icon size={26} aria-hidden="true" /></span>}
      <h2 className={styles.emptyTitle}>{title}</h2>
      {body && <p className={styles.muted}>{body}</p>}
      {action && <div className={styles.actions}>{action}</div>}
    </div>
  );
}
