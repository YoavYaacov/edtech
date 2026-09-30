import { useRef } from 'react';
import styles from './SegmentedControl.module.css';

// Compact single-choice pill control (radio group semantics, roving tabindex).
// Arrow keys move the choice following the VISUAL direction (RTL-aware); Home/End jump to the ends.
// options: [{ value, label }]
export default function SegmentedControl({ label, value, options, onChange, disabled = false, className = '' }) {
  const refs = useRef([]);
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  function move(to) {
    const i = (to + options.length) % options.length;
    onChange(options[i].value);
    refs.current[i]?.focus();
  }

  function onKeyDown(e) {
    const visualNext = rtl ? 'ArrowLeft' : 'ArrowRight';
    const visualPrev = rtl ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === visualNext || e.key === 'ArrowDown') { e.preventDefault(); move(index + 1); }
    else if (e.key === visualPrev || e.key === 'ArrowUp') { e.preventDefault(); move(index - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(options.length - 1); }
  }

  return (
    <div role="radiogroup" aria-label={label} className={`${styles.group} ${className}`} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={checked} disabled={disabled}
            tabIndex={i === index ? 0 : -1} ref={(el) => { refs.current[i] = el; }}
            className={`${styles.option} ${checked ? styles.on : ''}`} onClick={() => !checked && onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
