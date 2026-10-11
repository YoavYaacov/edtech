import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { SHORTCUTS, suggest } from '../shortcuts';
import { hasEmptySlot, sanitizeLatex } from '../mathLatex';

const by = (k) => SHORTCUTS.find((s) => s.key === k);

describe('shortcut registry (approved 43 + \\bin)', () => {
  it('has 44 unique entries with all fields', () => {
    expect(SHORTCUTS).toHaveLength(44);
    expect(new Set(SHORTCUTS.map((s) => s.key)).size).toBe(44);
    for (const s of SHORTCUTS) { expect(s.key && s.label && s.name && s.latex && s.kind).toBeTruthy(); }
  });
  it('keeps the agreed behaviour of the named shortcuts', () => {
    expect(by('c').latex).toBe('\\cdot');
    expect(by('vec').latex).toBe('\\overrightarrow{#0}');
    expect(by('bar').latex).toBe('\\overline{#0}');
    expect(by('under').latex).toBe('\\underline{#0}');
    expect(by('arc').latex).toBe('\\overgroup{#0}');
    expect(by('mix').latex).toBe('#?\\frac{#?}{#?}');
    expect(by('sp').latex).toBe('\\ {}');
    expect(by('quad').latex).toBe('\\quad{}');
  });
  it('\\bin is a binomial coefficient with two empty slots', () => {
    expect(by('bin')).toMatchObject({ key: 'bin', latex: '\\binom{#?}{#?}', kind: 'structure' });
    expect(by('bin').latex.match(/#\?/g)).toHaveLength(2);
  });
  it('\\bin is found by typing and runs at once (no other code extends "bin")', () => {
    expect(suggest('bin')[0].key).toBe('bin');
    expect(SHORTCUTS.filter((s) => s.key !== 'bin' && s.key.startsWith('bin'))).toEqual([]);
    expect(suggest('b').map((s) => s.key)).toContain('bin');
  });
  it('every template renders in KaTeX (slots shown as a box)', () => {
    for (const s of SHORTCUTS) {
      expect(() => katex.renderToString(s.latex.replace(/#0|#\?/g, '\\square'), { throwOnError: true, strict: 'ignore' }), s.key).not.toThrow();
    }
  });
  it('\\binom{n}{k} renders without error, also with full expressions in both places', () => {
    expect(() => katex.renderToString('\\binom{n}{k}', { throwOnError: true })).not.toThrow();
    expect(() => katex.renderToString('\\binom{n+1}{\\frac{k}{2}-1}', { throwOnError: true })).not.toThrow();
  });
  it('suggest ranks an exact key first and limits the list', () => {
    expect(suggest('c')[0].key).toBe('c');
    expect(suggest('s', 3).length).toBeLessThanOrEqual(3);
    expect(suggest('zzz')).toEqual([]);
  });
});

describe('sanitizeLatex', () => {
  it('replaces MathLive-only commands KaTeX does not know', () => {
    expect(sanitizeLatex('\\differentialD x')).toBe('\\mathrm{d} x');
    expect(sanitizeLatex('\\exponentialE^x+\\imaginaryI')).toBe('\\mathrm{e}^x+\\mathrm{i}');
  });
  it('turns empty placeholders into {}', () => { expect(sanitizeLatex('\\frac{\\placeholder{}}{2}')).toBe('\\frac{{}}{2}'); });
  it('wraps Hebrew letters in \\text{} but not those already inside it', () => {
    expect(sanitizeLatex('x=שטח')).toBe('x=\\text{שטח}');
    expect(sanitizeLatex('a=\\text{שטח}+b')).toBe('a=\\text{שטח}+b');
    expect(sanitizeLatex('גובה ברוחב+1')).toBe('\\text{גובה ברוחב}+1');
  });
  it('leaves ordinary LaTeX byte-for-byte', () => {
    for (const l of ['\\binom{n}{k}', '\\frac{x}{2}', '2\\frac13', '\\overgroup{AB}', '\\left|x-1\\right|', 'a\\ b', '\\int_0^1x^2dx']) expect(sanitizeLatex(l)).toBe(l);
  });
  it('hasEmptySlot detects unfilled placeholders only', () => {
    expect(hasEmptySlot('\\binom{\\placeholder{}}{k}')).toBe(true);
    expect(hasEmptySlot('\\binom{n}{k}')).toBe(false);
  });
});
