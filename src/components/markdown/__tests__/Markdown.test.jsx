import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Markdown from '../Markdown';

const html = (md) => { const { container } = render(<Markdown>{md}</Markdown>); return container.innerHTML; };
const underlined = (md) => Array.from(render(<Markdown>{md}</Markdown>).container.querySelectorAll('u')).map((u) => u.textContent);

describe('Markdown — underline ++text++ (R1B-3)', () => {
  it('underlines flanked text', () => {
    expect(underlined('זה ++חשוב++ מאוד')).toEqual(['חשוב']);
    expect(underlined('++שורה שלמה++')).toEqual(['שורה שלמה']);
  });
  it('spans bold, italic and formulas', () => {
    expect(underlined('++**מודגש**++')).toEqual(['מודגש']);
    expect(underlined('++a $x^2$ b++')[0]).toContain('a');
    expect(underlined('++a *b* c++')).toEqual(['a b c']);
  });
  it('several underlines in one paragraph', () => { expect(underlined('++א++ ו-++ב++')).toEqual(['א', 'ב']); });
  it('never touches programming text', () => {
    for (const t of ['i++', 'C++', 'x=i++;y=j++;', 'a++ + b++', 'for (i=0;i<n;i++) sum++;', 'i++ < n', 'C++ ו-Java', '3 ++ 4']) {
      expect(underlined(t), t).toEqual([]);
    }
  });
  it('does not touch inline code or code blocks', () => {
    expect(underlined('השתמשו ב-`++x++` כאן')).toEqual([]);
    expect(underlined('```java\n++x++\n```')).toEqual([]);
  });
  it('does not touch formulas', () => { expect(underlined('$a++b++c$')).toEqual([]); });
  it('requires content hugging the markers', () => {
    expect(underlined('++ רווח ++')).toEqual([]);
    expect(underlined('++לא נסגר')).toEqual([]);
  });
  it('leaves raw HTML skipped (no injection)', () => {
    expect(html('<u>x</u> ++y++')).not.toContain('<u>x</u>');
  });
  it('keeps ordinary markdown, lists and math working', () => {
    const out = html('1. **א**\n2. ב\n\n$$\n\\frac{a}{b}\n$$');
    expect(out).toContain('<ol>');
    expect(out).toContain('katex-display');
  });
});
