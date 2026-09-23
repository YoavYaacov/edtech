import styles from './Button.module.css';

// variant: primary | secondary | ghost
export default function Button({
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled,
  icon: Icon,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      type={type}
      className={`${styles.button} ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
