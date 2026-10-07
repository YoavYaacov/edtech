import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom does not lay out text, so the real visual check runs in a browser (see the R1B-1 report). This test pins the CSS
// contract that makes KaTeX safe inside Hebrew (RTL) text: every formula is an isolated LTR island, inline and display.
// Without it KaTeX's inline-block pieces flow right-to-left and `x+1` is shown as `1+x`.
const css = readFileSync(resolve(process.cwd(), 'src/components/markdown/Markdown.module.css'), 'utf8');
const rule = (sel) => { const m = css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[1] : ''; };

describe('KaTeX inside RTL text', () => {
  it('inline formulas are isolated LTR', () => {
    const r = rule('.md :global(.katex)');
    expect(r).toMatch(/direction:\s*ltr/);
    expect(r).toMatch(/unicode-bidi:\s*isolate/);
  });
  it('display formulas are isolated LTR', () => {
    const r = rule('.md :global(.katex-display)');
    expect(r).toMatch(/direction:\s*ltr/);
    expect(r).toMatch(/unicode-bidi:\s*isolate/);
  });
});
