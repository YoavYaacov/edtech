import { describe, expect, it } from 'vitest';
import { LIMITS, checkFile, checkPdfStats, sha256Hex } from '../pdfPrecheck';

const f = (o) => ({ name: 'a.pdf', type: 'application/pdf', size: 1000, ...o });
describe('pdfPrecheck', () => {
  it('file checks: type, empty, size', () => {
    expect(checkFile(null)).toBe('no_file');
    expect(checkFile(f({}))).toBeNull();
    expect(checkFile(f({ type: '', name: 'x.PDF' }))).toBeNull();
    expect(checkFile(f({ type: 'image/png', name: 'x.png' }))).toBe('not_pdf');
    expect(checkFile(f({ size: 0 }))).toBe('empty_file');
    expect(checkFile(f({ size: LIMITS.maxBytes + 1 }))).toBe('file_too_large');
    expect(checkFile(f({ size: LIMITS.maxBytes }))).toBeNull();
  });
  it('page checks mirror the server: page cap and scanned detection', () => {
    const text = (n, chars) => Array.from({ length: n }, () => ({ chars, images: 0 }));
    expect(checkPdfStats(0, [])).toBe('unreadable');
    expect(checkPdfStats(31, text(31, 500))).toBe('too_many_pages');
    expect(checkPdfStats(30, text(30, 500))).toBeNull();
    expect(checkPdfStats(10, text(10, 5))).toBe('scanned_pdf');
    // exactly 30% text pages is accepted (server: text_pages*100 < n*30 is the failing case)
    expect(checkPdfStats(10, [...text(3, 500), ...text(7, 0)])).toBeNull();
    expect(checkPdfStats(10, [...text(2, 500), ...text(8, 0)])).toBe('scanned_pdf');
    expect(checkPdfStats(5, [])).toBeNull();
  });
  it('sha256 is lowercase hex', async () => {
    const buf = new TextEncoder().encode('abc').buffer;
    expect(await sha256Hex(buf)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
