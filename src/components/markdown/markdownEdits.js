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
