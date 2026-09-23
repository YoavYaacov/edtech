import styles from './ListMotif.module.css';

// Decorative linked list (code is LTR): 10 → 20 → 30 → null
const nodes = [
  { value: 10, tone: 'sky' },
  { value: 20, tone: 'mint' },
  { value: 30, tone: 'peach' },
];

export default function ListMotif() {
  return (
    <div className={styles.motif} aria-hidden="true">
      <span className={styles.pointer}>head</span>
      <div className={styles.row}>
        {nodes.map((n) => (
          <div key={n.value} className={styles.item}>
            <div className={styles.node} data-tone={n.tone}>
              <span className={styles.value}>{n.value}</span>
              <span className={styles.next}><span className={styles.dot} /></span>
            </div>
            <span className={styles.arrow} />
          </div>
        ))}
        <span className={styles.null}>null</span>
      </div>
    </div>
  );
}
