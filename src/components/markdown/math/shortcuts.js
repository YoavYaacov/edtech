// The ONE registry of backslash shortcuts (approved in the R1B spike: 43 entries, plus \bin from R1B-3).
// The editor's "\\" popover, the palette buttons and the reference table all read from here; the editor has no
// hard-coded shortcut anywhere else.
//   key   = what is typed after "\\" (case-sensitive for an exact match)
//   latex = MathLive insert template: #? = an empty slot to fill, #0 = the current selection / first slot
//   kind  = symbol | structure | function
export const SHORTCUTS = [
  { key: 'c', label: '·', name: 'נקודת כפל', latex: '\\cdot', kind: 'symbol' },
  { key: 'x', label: '×', name: 'כפל', latex: '\\times', kind: 'symbol' },
  { key: 'd', label: '÷', name: 'חילוק', latex: '\\div', kind: 'symbol' },
  { key: 'pm', label: '±', name: 'פלוס מינוס', latex: '\\pm', kind: 'symbol' },
  { key: 'mix', label: '2⅓', name: 'שבר מעורב', latex: '#?\\frac{#?}{#?}', kind: 'structure' },
  { key: 'sp', label: '␣', name: 'רווח (גם מקש Space)', latex: '\\ {}', kind: 'symbol' },
  { key: 'quad', label: '⟷', name: 'רווח רחב', latex: '\\quad{}', kind: 'symbol' },
  { key: 'sqrt', label: '√', name: 'שורש ריבועי', latex: '\\sqrt{#0}', kind: 'structure' },
  { key: 'nroot', label: 'ⁿ√', name: 'שורש מסדר n', latex: '\\sqrt[#?]{#0}', kind: 'structure' },
  { key: 'bin', label: '(ⁿₖ)', name: 'מקדם בינומי', latex: '\\binom{#?}{#?}', kind: 'structure' },
  { key: 'ne', label: '≠', name: 'שונה', latex: '\\ne', kind: 'symbol' },
  { key: 'le', label: '≤', name: 'קטן או שווה', latex: '\\le', kind: 'symbol' },
  { key: 'ge', label: '≥', name: 'גדול או שווה', latex: '\\ge', kind: 'symbol' },
  { key: 'approx', label: '≈', name: 'בקירוב', latex: '\\approx', kind: 'symbol' },
  { key: 'inf', label: '∞', name: 'אינסוף', latex: '\\infty', kind: 'symbol' },
  { key: 'to', label: '→', name: 'חץ', latex: '\\to', kind: 'symbol' },
  { key: 'in', label: '∈', name: 'שייך', latex: '\\in', kind: 'symbol' },
  { key: 'notin', label: '∉', name: 'לא שייך', latex: '\\notin', kind: 'symbol' },
  { key: 'int', label: '∫', name: 'אינטגרל', latex: '\\int_{#?}^{#?}#?', kind: 'structure' },
  { key: 'sum', label: 'Σ', name: 'סכום', latex: '\\sum_{#?}^{#?}#?', kind: 'structure' },
  { key: 'lim', label: 'lim', name: 'גבול', latex: '\\lim_{#?\\to #?}#?', kind: 'structure' },
  { key: 'abs', label: '|□|', name: 'ערך מוחלט', latex: '\\left|#0\\right|', kind: 'structure' },
  { key: 'sin', label: 'sin', name: 'סינוס', latex: '\\sin', kind: 'function' },
  { key: 'cos', label: 'cos', name: 'קוסינוס', latex: '\\cos', kind: 'function' },
  { key: 'tan', label: 'tan', name: 'טנגנס', latex: '\\tan', kind: 'function' },
  { key: 'ln', label: 'ln', name: 'לוגריתם טבעי', latex: '\\ln', kind: 'function' },
  { key: 'log', label: 'log', name: 'לוגריתם', latex: '\\log_{#?}', kind: 'function' },
  { key: 'pi', label: 'π', name: 'פאי', latex: '\\pi', kind: 'symbol' },
  { key: 'alpha', label: 'α', name: 'אלפא', latex: '\\alpha', kind: 'symbol' },
  { key: 'beta', label: 'β', name: 'בטא', latex: '\\beta', kind: 'symbol' },
  { key: 'theta', label: 'θ', name: 'תטא', latex: '\\theta', kind: 'symbol' },
  { key: 'delta', label: 'Δ', name: 'דלתא', latex: '\\Delta', kind: 'symbol' },
  { key: 'lambda', label: 'λ', name: 'למדא', latex: '\\lambda', kind: 'symbol' },
  { key: 'R', label: 'ℝ', name: 'ממשיים', latex: '\\mathbb{R}', kind: 'symbol' },
  { key: 'N', label: 'ℕ', name: 'טבעיים', latex: '\\mathbb{N}', kind: 'symbol' },
  { key: 'angle', label: '∠', name: 'זווית', latex: '\\angle', kind: 'symbol' },
  { key: 'perp', label: '⊥', name: 'ניצב', latex: '\\perp', kind: 'symbol' },
  { key: 'parallel', label: '∥', name: 'מקביל', latex: '\\parallel', kind: 'symbol' },
  { key: 'triangle', label: '△', name: 'משולש', latex: '\\triangle', kind: 'symbol' },
  { key: 'deg', label: '°', name: 'מעלות', latex: '^{\\circ}', kind: 'symbol' },
  { key: 'vec', label: 'AB→', name: 'וקטור', latex: '\\overrightarrow{#0}', kind: 'structure' },
  { key: 'bar', label: 'Ā', name: 'קו עליון (משלים)', latex: '\\overline{#0}', kind: 'structure' },
  { key: 'under', label: 'A̲', name: 'קו תחתון (במתמטיקה)', latex: '\\underline{#0}', kind: 'structure' },
  { key: 'arc', label: '⌒AB', name: 'קשת', latex: '\\overgroup{#0}', kind: 'structure' },
];

// Ranking: exact key first, then case-insensitive equal, prefix, substring.
export function suggest(buffer, limit = 8) {
  const b = buffer.toLowerCase();
  const sc = SHORTCUTS.map((s) => { const k = s.key.toLowerCase(); return { s, n: s.key === buffer ? 0 : k === b ? 1 : k.startsWith(b) ? 2 : k.includes(b) ? 3 : 9 }; }).filter((x) => x.n < 9);
  sc.sort((a, z) => a.n - z.n || a.s.key.length - z.s.key.length);
  return sc.slice(0, limit).map((x) => x.s);
}
