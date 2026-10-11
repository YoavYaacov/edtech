import { lazy, Suspense, useId, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Code, Italic, List, ListOrdered, Sigma, SquareCode, Underline } from 'lucide-react';
import { codeBlock, continueList, findMath, mathAt, prefixLines, replaceMath, toggleWrap, wrap } from './markdownEdits';
import Markdown from './Markdown';
import { markdownToolbar as t } from '../../i18n/he';
import fieldStyles from '../ui/TextField.module.css';
import styles from './MarkdownField.module.css';

// The formula editor (and MathLive inside it) loads only when someone opens it.
const MathPanel = lazy(() => import('./math/MathPanel'));

// THE shared content editor (question body, hints, solution explanation, notes, variants, import review, feedback,
// assignment instructions). One component, so every place gets the same behaviour:
//   * a textarea with a toolbar that inserts Markdown syntax (bold, italic, underline ++x++, code, lists)
//   * Enter continues numbered/bullet lists and ends them on an empty item (markdownEdits.continueList)
//   * a visual formula editor (Σ / Ctrl+M) that stores plain `$…$` / `$$…$$`; clicking a formula in the preview edits it
//   * an Edit / Preview switch rendered by the SAME <Markdown> the student sees. Switching never changes the text
//     (the textarea stays mounted, only hidden, so even its undo history survives).
// The value is always the raw Markdown string; onChange receives an event-like { target: { value } }.
export default function MarkdownField({ label, hint, value, onChange, rows = 4, math = true, ...props }) {
  const id = useId();
  const ref = useRef(null);
  const previewRef = useRef(null);
  const [mode, setMode] = useState('write'); // write | preview
  const [panel, setPanel] = useState(null);  // null | { range, latex, display }
  const pendingCaret = useRef(null);        // caret to restore right after React writes the new value (fallback path)

  useLayoutEffect(() => {
    const c = pendingCaret.current;
    if (c && ref.current) { pendingCaret.current = null; ref.current.setSelectionRange(c.start ?? c, c.end ?? c); }
  }, [value]);

  const emit = (next) => onChange({ target: { value: next } });

  // Replace text[start,end) with `insert` through the browser's editing pipeline (keeps Ctrl+Z), then place the caret.
  function applyEdit({ start, end, insert, caret }) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    const ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, insert);
    const place = () => { el.setSelectionRange(caret.start ?? caret, caret.end ?? caret); };
    if (ok) place(); // synchronous: fast typing right after Enter must not race a deferred caret move
    else { pendingCaret.current = caret; emit(value.slice(0, start) + insert + value.slice(end)); }
  }

  function apply(kind) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);

    if (kind === 'underline') {
      const e = toggleWrap(value, start, end, '++', t.placeholderText);
      applyEdit({ start: e.start, end: e.end, insert: e.insert, caret: { start: e.selStart, end: e.selEnd } });
      return;
    }
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
    applyEdit({ start, end, insert, caret: { start: start + offset + edit.selStart, end: start + offset + edit.selEnd } });
  }

  // ---- formulas ----
  function openMath() {
    if (!math) return;
    const el = ref.current;
    const s = el ? el.selectionStart : value.length;
    const e = el ? el.selectionEnd : value.length;
    const hit = mathAt(value, s, e);
    if (hit) setPanel({ range: hit, latex: hit.latex, display: hit.display });
    else setPanel({ range: { start: e, end: e, display: false, insertOnly: true }, latex: '', display: false });
  }
  function applyMath(latex, display) {
    const r = panel.range;
    const range = r.insertOnly ? { start: r.start, end: r.end } : r;
    const out = replaceMath(value, range, latex, display);
    setPanel(null);
    if (out.text !== value) emit(out.text);
    requestAnimationFrame(() => { const el = ref.current; if (el && mode === 'write') { el.focus(); el.setSelectionRange(out.caret, out.caret); } });
  }
  function onPreviewClick(e) {
    if (!math) return;
    const node = e.target.closest?.('.katex, .katex-error');
    if (!node || !previewRef.current) return;
    const all = Array.from(previewRef.current.querySelectorAll('.katex, .katex-error')).filter((n) => !n.parentElement.closest('.katex'));
    const hit = findMath(value)[all.indexOf(node.closest('.katex-display > .katex') ?? node)];
    if (hit) setPanel({ range: hit, latex: hit.latex, display: hit.display });
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.nativeEvent?.isComposing) {
      const el = ref.current;
      const edit = continueList(value, el.selectionStart, el.selectionEnd);
      if (edit) { e.preventDefault(); applyEdit(edit); }
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'b' || key === 'i' || key === 'u') {
      e.preventDefault();
      apply(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
    } else if (key === 'm' && math) {
      e.preventDefault();
      openMath();
    }
  }

  const buttons = [
    { kind: 'bold', icon: Bold, label: t.bold },
    { kind: 'italic', icon: Italic, label: t.italic },
    { kind: 'underline', icon: Underline, label: t.underline },
    { kind: 'code', icon: Code, label: t.code },
    { kind: 'block', icon: SquareCode, label: t.codeBlock },
    { kind: 'ul', icon: List, label: t.bulletList },
    { kind: 'ol', icon: ListOrdered, label: t.numberedList },
  ];
  const writing = mode === 'write';

  return (
    <div className={fieldStyles.field}>
      {label && <label htmlFor={id} className={fieldStyles.label}>{label}</label>}
      <div className={styles.box}>
        <div className={styles.toolbar} role="toolbar" aria-label={t.toolbar} aria-controls={id}>
          {writing && buttons.map(({ kind, icon: Icon, label: l }) => (
            <button key={kind} type="button" className={styles.tool} title={l} aria-label={l}
              onMouseDown={(e) => e.preventDefault()} onClick={() => apply(kind)}>
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
          {writing && math && (
            <button type="button" className={styles.tool} title={t.math} aria-label={t.math}
              onMouseDown={(e) => e.preventDefault()} onClick={openMath}>
              <Sigma size={16} aria-hidden="true" />
            </button>
          )}
          <div className={styles.modes} role="group" aria-label={t.modeSwitch}>
            <button type="button" aria-pressed={writing} className={writing ? styles.modeOn : ''} onClick={() => setMode('write')}>{t.edit}</button>
            <button type="button" aria-pressed={!writing} className={!writing ? styles.modeOn : ''} onClick={() => setMode('preview')}>{t.preview}</button>
          </div>
        </div>

        {panel && (
          <Suspense fallback={<p className={styles.panelLoading}>…</p>}>
            <MathPanel key={`${panel.range.start}:${panel.range.end}`} initialLatex={panel.latex} initialDisplay={panel.display}
              isEdit={!panel.range.insertOnly} onApply={applyMath} onCancel={() => { setPanel(null); if (writing) ref.current?.focus(); }} />
          </Suspense>
        )}

        <textarea id={id} ref={ref} rows={rows} value={value} onChange={onChange} onKeyDown={onKeyDown} hidden={!writing}
          className={`${fieldStyles.input} ${fieldStyles.textarea} ${styles.textarea}`} {...props} />

        {!writing && (
          <div ref={previewRef} className={`${styles.preview} ${math ? styles.previewMath : ''}`} onClick={onPreviewClick}
            data-testid="md-preview" style={{ minHeight: `${rows * 1.6}em` }}>
            <Markdown empty={<p className={styles.previewEmpty}>{t.previewEmpty}</p>}>{value}</Markdown>
          </div>
        )}
      </div>
      {!writing && math && findMath(value).length > 0 && <p className={fieldStyles.hint}>{t.previewHint}</p>}
      {hint && <p className={fieldStyles.hint}>{hint}</p>}
    </div>
  );
}
