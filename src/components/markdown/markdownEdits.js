// Pure text transforms for the Markdown toolbar.
// Each returns { text, selStart, selEnd } for the replaced region.

export function wrap(selected, before, after, placeholder) {
  const inner = selected || placeholder;
  return {
    text: `${before}${inner}${after}`,
    selStart: before.length,
    selEnd: before.length + inner.length,
  };
}

export function codeBlock(selected, placeholder) {
  const inner = selected || placeholder;
  const text = `\n\`\`\`\n${inner}\n\`\`\`\n`;
  return { text, selStart: 5, selEnd: 5 + inner.length };
}

// Prefix every line of the selection. ordered → "1. ", "2. " ...
export function prefixLines(selected, ordered, placeholder) {
  const lines = (selected || placeholder).split('\n');
  const text = lines.map((l, i) => `${ordered ? `${i + 1}. ` : '- '}${l}`).join('\n');
  return { text, selStart: text.length, selEnd: text.length };
}

// ---------------------------------------------------------------------------------------------
// R1B-3
// ---------------------------------------------------------------------------------------------

const FENCE = /^\s{0,3}(```|~~~)/;
// "  1. text", "- text", "* text", "+ text" (and "1) text"). Group: indent, ordered number, delimiter, bullet, rest.
const ITEM = /^(\s*)(?:(\d{1,9})([.)])|([-*+]))(\s+)(.*)$/;

// Is the position inside a fenced code block (``` or ~~~)? Counts the fence lines before the line that holds `pos`.
export function isInsideFence(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let open = false;
  for (const line of text.slice(0, lineStart).split('\n')) if (FENCE.test(line)) open = !open;
  return open;
}

// Enter inside a Markdown list. Pure: returns null when the key must behave normally, otherwise an edit
//   { start, end, insert, caret }  = replace text[start, end) with `insert`; the caret goes to absolute index `caret`
// in the NEW text. The caller applies it (execCommand keeps undo) and positions the caret.
//   * "1. a⏎" → new line "2. "   (numbering continues from the item's own number, so lists may start anywhere)
//   * "- a⏎"  → new line "- "    (same bullet character and indent)
//   * Enter on an EMPTY item ends the list (the marker is removed, the caret stays on a plain line)
//   * Enter in the middle of an item moves the rest of the text to the new item
//   * never inside a code fence, never with a selection, never when the caret is in the marker itself.
export function continueList(text, selStart, selEnd) {
  if (selStart !== selEnd) return null;
  const pos = selStart;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let lineEnd = text.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const m = ITEM.exec(line);
  if (!m) return null;
  if (isInsideFence(text, pos)) return null;
  const [, indent, num, delim, bullet, gap, rest] = m;
  const contentStart = lineStart + line.length - rest.length;
  if (pos < contentStart) return null; // caret inside the marker: normal Enter
  const before = text.slice(contentStart, pos); // item text before the caret
  const tail = text.slice(pos, lineEnd);        // item text after the caret
  if (!before.trim() && !tail.trim()) {
    // empty item: end the list. Remove the marker (and its indent) from this line.
    return { start: lineStart, end: lineEnd, insert: '', caret: lineStart };
  }
  const marker = bullet ? bullet : `${Number(num) + 1}${delim}`;
  const insert = `\n${indent}${marker}${gap}${tail.replace(/^\s+/, '')}`;
  return {
    // the tail is part of `insert`, so the replaced range runs to the end of the line (whitespace right after the caret is dropped)
    start: pos, end: lineEnd, insert,
    caret: pos + 1 + indent.length + marker.length + gap.length,
  };
}

// Toggle a wrapper (used for underline ++text++): wraps the selection, or unwraps when it is already wrapped,
// either inside the selection ("++a++") or just around it. Returns { start, end, insert, selStart, selEnd } (absolute).
export function toggleWrap(text, selStart, selEnd, mark, placeholder) {
  const selected = text.slice(selStart, selEnd);
  const n = mark.length;
  if (selected.startsWith(mark) && selected.endsWith(mark) && selected.length >= 2 * n) {
    const inner = selected.slice(n, selected.length - n);
    return { start: selStart, end: selEnd, insert: inner, selStart, selEnd: selStart + inner.length };
  }
  if (text.slice(selStart - n, selStart) === mark && text.slice(selEnd, selEnd + n) === mark && selStart !== selEnd) {
    return { start: selStart - n, end: selEnd + n, insert: selected, selStart: selStart - n, selEnd: selStart - n + selected.length };
  }
  const inner = selected || placeholder;
  return { start: selStart, end: selEnd, insert: `${mark}${inner}${mark}`, selStart: selStart + n, selEnd: selStart + n + inner.length };
}

// ---- formulas ($…$ and $$…$$) located in the raw text -----------------------------------------
// Returns [{ start, end, latex, display }] in document order. start/end cover the delimiters. Skips fenced code,
// inline code and escaped dollars, so it agrees with what remark-math renders for the texts we store.
export function findMath(text) {
  const out = [];
  let i = 0;
  const n = text.length;
  let inFence = false;
  while (i < n) {
    const ls = i;
    let le = text.indexOf('\n', i);
    if (le === -1) le = n;
    const line = text.slice(ls, le);
    if (FENCE.test(line)) { inFence = !inFence; i = le + 1; continue; }
    if (inFence) { i = le + 1; continue; }
    // scan this line (display math may continue across lines, handled below)
    let j = ls;
    while (j < le) {
      const c = text[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') {
        let k = j; while (text[k] === '`') k += 1;
        const ticks = text.slice(j, k);
        const close = text.indexOf(ticks, k);
        j = close === -1 ? k : close + ticks.length; continue;
      }
      if (c === '$') {
        if (text[j + 1] === '$') {
          const close = findClose(text, j + 2, '$$');
          if (close === -1) { j += 2; continue; }
          out.push({ start: j, end: close + 2, latex: text.slice(j + 2, close).trim(), display: true });
          j = close + 2;
          if (j > le) { le = text.indexOf('\n', j - 1); if (le === -1) le = n; }
          continue;
        }
        const close = findClose(text, j + 1, '$', true);
        if (close === -1 || close === j + 1) { j += 1; continue; }
        out.push({ start: j, end: close + 1, latex: text.slice(j + 1, close).trim(), display: false });
        j = close + 1; continue;
      }
      j += 1;
    }
    i = Math.max(le, j) + 1;
  }
  return out;
}
function findClose(text, from, mark, sameParagraph = false) {
  let k = from;
  while (k < text.length) {
    if (text[k] === '\\') { k += 2; continue; }
    if (sameParagraph && text[k] === '\n' && text[k + 1] === '\n') return -1;
    if (text.startsWith(mark, k)) return k;
    k += 1;
  }
  return -1;
}

// The formula the caret/selection is INSIDE (strictly between its delimiters), or that is selected as a whole; else null.
// A caret just before/after a formula is not "in" it, so Ctrl+M right after finishing one inserts a new formula.
export function mathAt(text, selStart, selEnd = selStart) {
  return findMath(text).find((m) => (selStart > m.start && selEnd < m.end) || (selStart === m.start && selEnd === m.end)) ?? null;
}

// Replace a formula (or insert at a position). Returns { text, caret } with the caret after the inserted formula.
// A display formula is written as a real block ($$ on its own lines), because remark-math renders a one-line `$$…$$`
// inline. An EXISTING one-line `$$…$$` stays one-line, so editing it never changes how the question already looks.
export function replaceMath(text, range, latex, display) {
  const start = range ? range.start : 0;
  const end = range ? range.end : 0;
  const wasOneLine = range && range.display && !text.slice(range.start, range.end).includes('\n');
  let body;
  if (!display) body = `$${latex}$`;
  else if (wasOneLine) body = `$$${latex}$$`;
  else {
    const before = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
    const after = end < text.length && text[end] !== '\n' ? '\n' : '';
    body = `${before}$$\n${latex}\n$$${after}`;
  }
  return { text: text.slice(0, start) + body + text.slice(end), caret: start + body.length };
}
