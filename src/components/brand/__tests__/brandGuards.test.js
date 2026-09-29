import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SRC = join(process.cwd(), 'src');
const read = (p) => readFileSync(join(SRC, p), 'utf8');
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p, out); } else out.push(p);
  }
  return out;
}
const TEXT_EXT = new Set(['.js', '.jsx', '.css', '.html', '.svg', '.json']);

describe('branding guards', () => {
  it('the old name "חוליה" survives only as the curriculum term (terms.node)', () => {
    const hits = [];
    for (const f of walk(SRC)) {
      if (!TEXT_EXT.has(extname(f))) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('חוליה')) hits.push(`${f.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^i18n\/he\.js:\d+: node: 'חוליה',$/);
  });

  it('hevanti-symbol-tight.svg is the locked symbol: identical drawing, only the frame (viewBox/size) differs', () => {
    const inner = (s) => s.replace(/<svg[^>]*>/, '').replace('</svg>', '').trim();
    const source = read('assets/brand/hevanti-symbol.svg');
    const tight = read('assets/brand/hevanti-symbol-tight.svg');
    expect(inner(tight)).toBe(inner(source));
    expect(tight).not.toBe(source); // it IS a re-framed copy
  });

  it('master logo SVGs use outlined text (no <text>, no font dependency) and embed the locked symbol drawing', () => {
    const symbolPaths = read('assets/brand/hevanti-symbol.svg').match(/<path d="([^"]+)"/)[1];
    for (const f of ['hevanti-logo-master.svg', 'hevanti-logo-horizontal.svg']) {
      const s = read(`assets/brand/${f}`);
      expect(s).not.toMatch(/<text|font-family/);
      expect(s).toContain(symbolPaths);
    }
  });
});
