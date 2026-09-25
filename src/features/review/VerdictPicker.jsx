import { CheckCircle2, CircleDot, Wrench, XCircle } from 'lucide-react';
import { verdictLabels } from '../../i18n/he';
import styles from './review.module.css';

// Verdict = quality of the answer (decision 49). Text + icon, never color alone (59).
export const VERDICTS = [
  { value: 'correct', icon: CheckCircle2 },
  { value: 'partial', icon: CircleDot },
  { value: 'needs_fix', icon: Wrench },
  { value: 'incorrect', icon: XCircle },
];

export default function VerdictPicker({ value, onChange, disabled, label }) {
  return (
    <div className={styles.verdicts} role="radiogroup" aria-label={label}>
      {VERDICTS.map(({ value: v, icon: Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled}
          className={`${styles.verdict} ${value === v ? styles.verdictOn : ''}`} data-verdict={v}
          onClick={() => onChange(value === v ? '' : v)}>
          <Icon size={18} aria-hidden="true" />
          <span>{verdictLabels[v]}</span>
        </button>
      ))}
    </div>
  );
}
