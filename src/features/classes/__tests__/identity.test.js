import { describe, expect, it } from 'vitest';
import { cleanName, isValidIsraeliId, isValidName, normalizeIdNumber } from '../identity';

describe('Israeli ID checksum', () => {
  it('accepts valid numbers, with padding and separators', () => {
    expect(isValidIsraeliId('936044502')).toBe(true);
    expect(isValidIsraeliId('123456782')).toBe(true);
    expect(isValidIsraeliId('93604450-2')).toBe(true);
    expect(isValidIsraeliId(' 936 044 502 ')).toBe(true);
    expect(isValidIsraeliId('00000018')).toBe(true); // short numbers are left-padded to 9
  });
  it('rejects bad checksums, bad lengths, non-digits and all zeros', () => {
    expect(isValidIsraeliId('936044503')).toBe(false);
    expect(isValidIsraeliId('1234')).toBe(false);
    expect(isValidIsraeliId('1234567890')).toBe(false);
    expect(isValidIsraeliId('12ab56782')).toBe(false);
    expect(isValidIsraeliId('000000000')).toBe(false);
    expect(isValidIsraeliId('')).toBe(false);
    expect(isValidIsraeliId(null)).toBe(false);
  });
  it('normalizes', () => expect(normalizeIdNumber(' 12-34 ')).toBe('1234'));
});

describe('names', () => {
  it('collapses whitespace and rejects markup / control characters / overlong', () => {
    expect(cleanName('  דנה   כהן ')).toBe('דנה כהן');
    expect(isValidName('דנה')).toBe(true);
    expect(isValidName('<b>')).toBe(false);
    expect(isValidName('a\u0000b')).toBe(false);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('x'.repeat(41))).toBe(false);
  });
});
