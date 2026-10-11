import { describe, expect, it } from 'vitest';
import { continueList, findMath, isInsideFence, mathAt, replaceMath, toggleWrap } from '../markdownEdits';

// apply an edit the way MarkdownField does, to check the final text + caret
function apply(text, e) { return { text: text.slice(0, e.start) + e.insert + text.slice(e.end), caret: e.caret }; }
const enter = (text, at = text.length) => { const e = continueList(text, at, at); return e && apply(text, e); };

describe('continueList — numbered lists', () => {
  it('1, 2 → 3', () => {
    const r = enter('1. פריט ראשון\n2. פריט שני');
    expect(r.text).toBe('1. פריט ראשון\n2. פריט שני\n3. ');
    expect(r.caret).toBe(r.text.length);
  });
  it('keeps going: 3 → 4 → 5', () => {
    let t = '1. a\n2. b\n3. c';
    t = enter(t).text + 'd';
    expect(enter(t).text.endsWith('\n5. ')).toBe(true);
  });
  it('starts from any number', () => { expect(enter('7. x').text).toBe('7. x\n8. '); });
  it('supports the "1)" delimiter', () => { expect(enter('1) x').text).toBe('1) x\n2) '); });
  it('keeps indentation of a nested item', () => { expect(enter('1. a\n   1. b').text).toBe('1. a\n   1. b\n   2. '); });
  it('Enter in the middle moves the rest of the item to the new one', () => {
    const t = '1. אבגד';
    const r = enter(t, 5); // after "אב"
    expect(r.text).toBe('1. אב\n2. גד');
    expect(r.caret).toBe('1. אב\n2. '.length);
  });
  it('two-digit numbers and a following line are untouched', () => {
    const t = '9. a\nשורה אחרת';
    const r = enter(t, 4);
    expect(r.text).toBe('9. a\n10. \nשורה אחרת');
  });
});

describe('continueList — bullets', () => {
  it.each(['-', '*', '+'])('keeps the %s bullet', (b) => { expect(enter(`${b} פריט`).text).toBe(`${b} פריט\n${b} `); });
  it('keeps indent', () => { expect(enter('  - a').text).toBe('  - a\n  - '); });
});

describe('continueList — ending a list', () => {
  it('Enter on an empty numbered item ends the list', () => {
    const r = enter('1. a\n2. b\n3. ');
    expect(r.text).toBe('1. a\n2. b\n');
    expect(r.caret).toBe('1. a\n2. b\n'.length);
  });
  it('Enter on an empty bullet ends the list', () => { expect(enter('- a\n- ').text).toBe('- a\n'); });
  it('an empty item in the middle of a document keeps the following text', () => {
    const t = '- a\n- \nסוף';
    expect(enter(t, 6).text).toBe('- a\n\nסוף');
  });
});

describe('continueList — must not interfere', () => {
  it('returns null on a plain line (normal Enter)', () => { expect(enter('שלום עולם')).toBeNull(); });
  it('returns null on an empty text', () => { expect(enter('')).toBeNull(); });
  it('returns null with a selection (replace-selection behaviour stays native)', () => { expect(continueList('1. abc', 3, 6)).toBeNull(); });
  it('returns null when the caret is inside the marker', () => { expect(enter('1. abc', 1)).toBeNull(); });
  it('does not treat "1.5 מטר" or "-5" as lists', () => {
    expect(enter('1.5 מטר')).toBeNull();
    expect(enter('-5 מעלות')).toBeNull();
  });
  it('returns null inside a code fence', () => {
    const t = '```java\n1. not a list\n- nor this';
    expect(enter(t)).toBeNull();
    expect(enter('```\n- a')).toBeNull();
  });
  it('works again after the fence is closed', () => {
    expect(enter('```\ncode\n```\n- a').text).toBe('```\ncode\n```\n- a\n- ');
  });
  it('Java code with brackets and strings inside a fence is left alone', () => {
    const t = '```java\nSystem.out.println("1. a (b)");\n- x';
    expect(enter(t)).toBeNull();
  });
  it('a list item that contains a formula or code continues normally', () => {
    expect(enter('1. נחשב $x^2$ ואת `f(x)`').text.endsWith('\n2. ')).toBe(true);
  });
});

describe('isInsideFence', () => {
  it('tracks open and closed fences', () => {
    expect(isInsideFence('a\n```\nb', 7)).toBe(true);
    expect(isInsideFence('a\n```\nb\n```\nc', 13)).toBe(false);
  });
});

describe('toggleWrap (underline ++)', () => {
  it('wraps a selection', () => {
    const e = toggleWrap('abc def', 0, 3, '++', 'טקסט');
    expect(apply('abc def', e).text).toBe('++abc++ def');
  });
  it('wraps a placeholder with no selection', () => {
    const e = toggleWrap('', 0, 0, '++', 'טקסט');
    expect(e.insert).toBe('++טקסט++');
  });
  it('unwraps when the selection includes the marks', () => {
    const e = toggleWrap('++abc++ x', 0, 7, '++', 'p');
    expect(apply('++abc++ x', e).text).toBe('abc x');
  });
  it('unwraps when the marks surround the selection', () => {
    const e = toggleWrap('++abc++ x', 2, 5, '++', 'p');
    expect(apply('++abc++ x', e).text).toBe('abc x');
  });
});

describe('findMath / mathAt / replaceMath', () => {
  it('finds inline and display formulas and ignores code and escaped dollars', () => {
    const t = 'חשבו $x^2$ ואז $$\\frac{a}{b}$$ וגם `$no$` ו-\\$5 ו-$y$';
    const m = findMath(t);
    expect(m.map((x) => x.latex)).toEqual(['x^2', '\\frac{a}{b}', 'y']);
    expect(m.map((x) => x.display)).toEqual([false, true, false]);
  });
  it('ignores dollars inside a code fence', () => {
    expect(findMath('```java\nString s = "$a$";\n```\n$b$').map((x) => x.latex)).toEqual(['b']);
  });
  it('handles multi-line display math', () => {
    expect(findMath('$$\n\\frac{1}{2}\n$$\nטקסט').map((x) => x.latex)).toEqual(['\\frac{1}{2}']);
  });
  it('a lone dollar is not a formula', () => { expect(findMath('המחיר \\$5 או $ בודד')).toEqual([]); });
  it('mathAt finds the formula around the caret, null elsewhere', () => {
    const t = 'א $x+1$ ב';
    expect(mathAt(t, 5).latex).toBe('x+1');
    expect(mathAt(t, 0)).toBeNull();
  });
  it('a caret at the edge of a formula is not inside it; selecting the whole formula is', () => {
    const t = 'א $x+1$ ב';
    expect(mathAt(t, 2)).toBeNull();   // just before the opening $
    expect(mathAt(t, 7)).toBeNull();   // just after the closing $
    expect(mathAt(t, 2, 7).latex).toBe('x+1');
  });
  it('replaceMath swaps one formula and leaves the rest byte-for-byte', () => {
    const t = 'א $x$ ב $y$ ג';
    const r = replaceMath(t, findMath(t)[0], '\\frac{a}{b}', false);
    expect(r.text).toBe('א $\\frac{a}{b}$ ב $y$ ג');
  });
  it('replaceMath can switch inline → display and insert at a caret', () => {
    expect(replaceMath('$x$', findMath('$x$')[0], 'x', true).text).toBe('$$\nx\n$$');
    expect(replaceMath('א $$x$$ ב', findMath('א $$x$$ ב')[0], 'y', true).text).toBe('א $$y$$ ב'); // an existing one-line $$ keeps its form
    expect(replaceMath('אב', { start: 1, end: 1 }, 'y', true).text).toBe('א\n$$\ny\n$$\nב');
    expect(replaceMath('אב', { start: 1, end: 1 }, 'y', false).text).toBe('א$y$ב');
  });
});
