import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { mathEditor as t } from '../../../i18n/he';
import { SHORTCUTS } from './shortcuts';
import { attachBackslashLayer, insertShortcut } from './backslashLayer';
import { hasEmptySlot, sanitizeLatex } from './mathLatex';
import styles from './MathPanel.module.css';

// R1B-3 — the visual formula editor of the shared Markdown field (MathLive, approved in the R1B spike).
// It edits ONE formula and hands plain LaTeX back; storage stays `$…$` / `$$…$$` inside the Markdown text.
// MathLive is loaded lazily the first time the panel opens, so pages that never open a formula do not pay for it.

let mathLivePromise = null;
function loadMathLive() {
  if (!mathLivePromise) {
    mathLivePromise = import('mathlive').then((m) => {
      // fonts: KaTeX's own font-faces are already on the page (katex.min.css via <Markdown>), MathLive reuses the same family names
      m.MathfieldElement.fontsDirectory = null;
      m.MathfieldElement.soundsDirectory = null;
      return m;
    });
    mathLivePromise.catch(() => { mathLivePromise = null; });
  }
  return mathLivePromise;
}

// Palette buttons. `cmd:` = a MathLive command, otherwise an insert template (#? = empty slot, #0 = selection).
const PALETTE = [
  { label: '▫/▫', title: 'שבר', frac: true }, { label: 'x²', title: 'חזקה', cmd: 'moveToSuperscript' }, { label: 'x₁', title: 'אינדקס', cmd: 'moveToSubscript' },
  { label: '√', title: 'שורש', tpl: '\\sqrt{#0}' }, { label: 'ⁿ√', title: 'שורש מסדר n', tpl: '\\sqrt[#?]{#0}' }, { label: '( )', title: 'סוגריים', tpl: '(#0)' },
  { label: '(ⁿₖ)', title: 'מקדם בינומי (\\bin)', tpl: '\\binom{#?}{#?}' }, null,
  { label: 'π', title: 'פאי', tpl: '\\pi' }, { label: '±', title: 'פלוס מינוס', tpl: '\\pm' }, { label: '×', title: 'כפל', tpl: '\\times' }, { label: '÷', title: 'חילוק', tpl: '\\div' },
  { label: '≠', title: 'שונה', tpl: '\\neq' }, { label: '<', title: 'קטן', tpl: '<' }, { label: '>', title: 'גדול', tpl: '>' }, { label: '≤', title: 'קטן או שווה', tpl: '\\leq' }, { label: '≥', title: 'גדול או שווה', tpl: '\\geq' }, { label: '∞', title: 'אינסוף', tpl: '\\infty' }, null,
  { label: 'sin', title: 'סינוס', tpl: '\\sin' }, { label: 'cos', title: 'קוסינוס', tpl: '\\cos' }, { label: 'tan', title: 'טנגנס', tpl: '\\tan' }, { label: 'log', title: 'לוגריתם', tpl: '\\log_{#?}' }, { label: 'ln', title: 'לוגריתם טבעי', tpl: '\\ln' }, null,
  { label: 'Σ', title: 'סכום', tpl: '\\sum_{#?}^{#?}' }, { label: '∫', title: 'אינטגרל', tpl: '\\int_{#?}^{#?}' }, { label: 'lim', title: 'גבול', tpl: '\\lim_{#?\\to #?}' }, { label: '|x|', title: 'ערך מוחלט', tpl: '\\left|#0\\right|' },
  { label: '∠', title: 'זווית', tpl: '\\angle' }, { label: '△', title: 'משולש', tpl: '\\triangle' }, { label: '°', title: 'מעלות', tpl: '^\\circ' },
];

const renderKatex = (latex, displayMode = false) => katex.renderToString(latex, { throwOnError: true, strict: 'ignore', displayMode });

export default function MathPanel({ initialLatex = '', initialDisplay = false, isEdit = false, onApply, onCancel }) {
  const mfRef = useRef(null);
  const popRef = useRef(null);
  const layerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [display, setDisplay] = useState(initialDisplay);
  const [latex, setLatex] = useState(initialLatex);
  const apply = useRef(onApply); apply.current = onApply;
  const cancel = useRef(onCancel); cancel.current = onCancel;
  const displayRef = useRef(display); displayRef.current = display;
  const baseline = useRef(null); // what MathLive made of the loaded formula, to detect "opened but not changed"

  useEffect(() => {
    let alive = true;
    loadMathLive().then(() => { if (alive) setStatus('ready'); }).catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, []);

  function currentLatex() {
    const mf = mfRef.current;
    return mf ? mf.getValue('latex') : '';
  }

  function confirm() {
    const raw = currentLatex();
    const out = sanitizeLatex(raw);
    if (!out.trim() || hasEmptySlot(raw)) return;
    try { renderKatex(out); } catch { return; }
    // Opened an existing formula and changed nothing: leave the stored text byte-for-byte as it was (MathLive may
    // normalise equivalent LaTeX, and that must never rewrite a saved question by itself).
    if (isEdit && baseline.current !== null && raw === baseline.current && displayRef.current === initialDisplay) { cancel.current(); return; }
    apply.current(out, displayRef.current);
  }

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const mf = mfRef.current;
    if (!mf) return undefined;
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.setValue(initialLatex);
    baseline.current = mf.getValue('latex');
    const sync = () => setLatex(mf.getValue('latex'));
    mf.addEventListener('input', sync);
    const layer = attachBackslashLayer(mf, popRef.current, { onChange: sync });
    layerRef.current = layer;
    const onKey = (e) => {
      if (layer.isOpen()) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); confirm(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cancel.current(); }
    };
    // capture phase, so MathLive's own Escape ("switch to LaTeX mode") and Enter handling never run first
    mf.addEventListener('keydown', onKey, true);
    sync();
    mf.focus();
    return () => { mf.removeEventListener('input', sync); mf.removeEventListener('keydown', onKey, true); layer.detach(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const out = useMemo(() => sanitizeLatex(latex), [latex]);
  const view = useMemo(() => {
    if (!out.trim()) return { html: '', error: '', empty: true };
    try { return { html: renderKatex(out.replace(/\\placeholder(?:\[[^\]]*\])?\{\s*\}/g, '\\square'), display), error: '', empty: false }; } catch (e) { return { html: '', error: String(e.message ?? e), empty: false }; }
  }, [out, display]);
  const emptySlot = hasEmptySlot(latex);
  const canApply = status === 'ready' && !view.empty && !view.error && !emptySlot;

  function press(item) {
    const mf = mfRef.current;
    if (!mf) return;
    mf.focus();
    if (item.frac) mf.executeCommand(['insert', '\\frac{#@}{#?}', { selectionMode: 'placeholder' }]);
    else if (item.cmd) mf.executeCommand(item.cmd);
    else mf.executeCommand(['insert', item.tpl, { selectionMode: 'placeholder' }]);
    setLatex(mf.getValue('latex'));
  }

  return (
    <div className={styles.panel} role="group" aria-label={isEdit ? t.titleEdit : t.title}>
      <div className={styles.head}>
        <strong>{isEdit ? t.titleEdit : t.title}</strong>
        <div className={styles.kind} role="radiogroup" aria-label={t.title}>
          <label><input type="radio" name="mathkind" checked={!display} onChange={() => { setDisplay(false); setTimeout(() => mfRef.current?.focus(), 0); }} />{t.inline}</label>
          <label><input type="radio" name="mathkind" checked={display} onChange={() => { setDisplay(true); setTimeout(() => mfRef.current?.focus(), 0); }} />{t.display}</label>
        </div>
      </div>

      {status === 'loading' && <p className={styles.muted}>{t.loading}</p>}
      {status === 'error' && <p className={styles.error} role="alert">{t.loadError}</p>}

      <div className={styles.fieldWrap} hidden={status !== 'ready'}>
        {status === 'ready' && <math-field ref={mfRef} className={styles.mf} aria-label={t.fieldLabel} dir="ltr" />}
        <div ref={popRef} className={styles.pop} hidden />
      </div>

      {status === 'ready' && (
        <>
          <div className={styles.palette} role="toolbar" aria-label={t.palette}>
            {PALETTE.map((it, i) => (it
              ? <button key={it.title + i} type="button" title={it.title} aria-label={it.title} onMouseDown={(e) => e.preventDefault()} onClick={() => press(it)}>{it.label}</button>
              : <span key={`s${i}`} className={styles.sep} />))}
          </div>
          <p className={styles.help}>{t.help}</p>
          <div className={styles.previewRow} aria-label={t.previewLabel}>
            <span className={styles.previewTag}>{t.previewLabel}</span>
            {view.empty && <span className={styles.muted}>{t.empty}</span>}
            {view.error && <span className={styles.error} role="alert">{t.invalid}{view.error}</span>}
            {!view.empty && !view.error && <span className={styles.katexBox} dangerouslySetInnerHTML={{ __html: view.html }} />}
          </div>
          {emptySlot && <p className={styles.error} role="alert">{t.emptySlot}</p>}
          <details className={styles.ref}>
            <summary>{t.shortcutsTitle}</summary>
            <table>
              <thead><tr><th>{t.colTyped}</th><th>{t.colName}</th><th>{t.colView}</th></tr></thead>
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={s.key}>
                    <td dir="ltr"><button type="button" className={styles.keyBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => { const mf = mfRef.current; if (mf) { insertShortcut(mf, s); setLatex(mf.getValue('latex')); } }}>{`\\${s.key}`}</button></td>
                    <td>{s.name}</td>
                    <td dir="ltr" dangerouslySetInnerHTML={{ __html: (() => { try { return renderKatex(s.latex.replace(/#0|#\?/g, '\\square')); } catch { return '?'; } })() }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.primary} disabled={!canApply} onClick={confirm}>{isEdit ? t.update : t.insert}</button>
        <button type="button" className={styles.secondary} onClick={() => cancel.current()}>{t.cancel}</button>
      </div>
    </div>
  );
}
