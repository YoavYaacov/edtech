import { useId, useRef } from 'react';
import { Bold, Code, Italic, List, ListOrdered, SquareCode } from 'lucide-react';
import { codeBlock, prefixLines, wrap } from './markdownEdits';
import { markdownToolbar as t } from '../../i18n/he';
import fieldStyles from '../ui/TextField.module.css';
import styles from './MarkdownField.module.css';

// A textarea with a small toolbar that inserts Markdown syntax for the user.
// It only edits the text; rendering stays in <Markdown>.
export default function MarkdownField({ label, hint, value, onChange, rows = 4, ...props }) {
  const id = useId();
  const ref = useRef(null);

  function apply(kind) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    // Lists and code blocks should start on their own line.
    const atLineStart = start === 0 || value[start - 1] === '\n';
    let edit;
    if (kind === 'bold') edit = wrap(selected, '**', '**', t.placeholderText);
    else if (kind === 'italic') edit = wrap(selected, '*', '*', t.placeholderText);
    else if (kind === 'code') edit = wrap(selected, '`', '`', t.placeholderCode);
    else if (kind === 'block') edit = codeBlock(selected, t.placeholderCode);
    else edit = prefixLines(selected, kind === 'ol', t.placeholderItem);

    let insert = edit.text;
    let offset = 0;
    if ((kind === 'ul' || kind === 'ol') && !atLineStart) { insert = `\n${insert}`; offset = 1; }

    el.focus();
    el.setSelectionRange(start, end);
    // execCommand keeps the browser's undo history (Ctrl+Z) and fires onChange.
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, insert);
    if (!ok) onChange({ target: { value: value.slice(0, start) + insert + value.slice(end) } });

    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + offset + edit.selStart, start + offset + edit.selEnd);
    });
  }

  function onKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b' || key === 'i') {
      e.preventDefault();
      apply(key === 'b' ? 'bold' : 'italic');
    }
  }

  const buttons = [
    { kind: 'bold', icon: Bold, label: t.bold },
    { kind: 'italic', icon: Italic, label: t.italic },
    { kind: 'code', icon: Code, label: t.code },
    { kind: 'block', icon: SquareCode, label: t.codeBlock },
    { kind: 'ul', icon: List, label: t.bulletList },
    { kind: 'ol', icon: ListOrdered, label: t.numberedList },
  ];

  return (
    <div className={fieldStyles.field}>
      {label && <label htmlFor={id} className={fieldStyles.label}>{label}</label>}
      <div className={styles.box}>
        <div className={styles.toolbar} role="toolbar" aria-label={t.toolbar} aria-controls={id}>
          {buttons.map(({ kind, icon: Icon, label: l }) => (
            <button key={kind} type="button" className={styles.tool} title={l} aria-label={l}
              onMouseDown={(e) => e.preventDefault()} onClick={() => apply(kind)}>
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
        <textarea id={id} ref={ref} rows={rows} value={value} onChange={onChange} onKeyDown={onKeyDown}
          className={`${fieldStyles.input} ${fieldStyles.textarea} ${styles.textarea}`} {...props} />
      </div>
      {hint && <p className={fieldStyles.hint}>{hint}</p>}
    </div>
  );
}
