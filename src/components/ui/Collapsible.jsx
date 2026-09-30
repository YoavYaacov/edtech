import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { useCollapsed } from '../../lib/useCollapsed';
import styles from './Collapsible.module.css';

// Accessible disclosure. The header is a real <button aria-expanded aria-controls> (Enter/Space work natively),
// at least 44px tall, with a chevron that points to the start side in RTL when closed.
// State is session-only (see useCollapsed). Closed content stays mounted but hidden (inert) so form state survives.
//   storageKey  stable id for session memory (omit = not remembered)
//   defaultOpen initial state when nothing is remembered
//   forceOpen   keeps it open regardless (e.g. it contains a selection)
//   heading     h-level of the wrapper (default 3)
export default function Collapsible({
  title, meta, actions, children, storageKey, defaultOpen = true, forceOpen = false,
  headingLevel = 3, className = '', bodyClassName = '', variant = 'card',
}) {
  const [stored, setOpen] = useCollapsed(storageKey, defaultOpen);
  const open = forceOpen || stored;
  const bodyId = useId();
  const Heading = `h${headingLevel}`;

  return (
    <section className={`${styles.root} ${styles[variant]} ${className}`} data-open={open || undefined}>
      <div className={styles.header}>
        <Heading className={styles.heading}>
          <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={bodyId}
            disabled={forceOpen} onClick={() => setOpen((o) => !o)}>
            <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
            <span className={styles.title}>{title}</span>
            {meta != null && <span className={styles.meta}>{meta}</span>}
          </button>
        </Heading>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div id={bodyId} className={styles.body} role="region" aria-hidden={!open} inert={!open || undefined}>
        <div className={`${styles.inner} ${bodyClassName}`}>{children}</div>
      </div>
    </section>
  );
}
