// LaTeX helpers for the formula editor. Pure, no MathLive dependency (so they are unit-testable in jsdom).

// MathLive-only commands that KaTeX does not know (checked in the R1B spike against KaTeX 0.16.47) are rewritten, an empty
// \placeholder becomes {}, and Hebrew letters typed inside a formula are wrapped in \text{} (KaTeX has no Hebrew glyphs in
// math mode, so raw Hebrew would render as an error/blank). Everything else is returned byte-for-byte.
export function sanitizeLatex(latex) {
  let l = latex
    .replace(/\\placeholder(?:\[[^\]]*\])?\{([^{}]*)\}/g, '{$1}')
    .replace(/\\differentialD/g, '\\mathrm{d}')
    .replace(/\\exponentialE/g, '\\mathrm{e}')
    .replace(/\\imaginaryI/g, '\\mathrm{i}');
  l = l.split(/(\\text\{[^{}]*\})/).map((part, i) => (i % 2 ? part
    : part.replace(/[֐-׿]+(?:[ ]+[֐-׿]+)*/g, (m) => `\\text{${m}}`))).join('');
  return l;
}

// True when the formula still contains an empty slot the user did not fill (we warn before saving it).
export function hasEmptySlot(latex) {
  return /\\placeholder(?:\[[^\]]*\])?\{\s*\}/.test(latex);
}
