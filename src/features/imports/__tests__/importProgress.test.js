import { describe, expect, it } from 'vitest';
import { computeProgress, rangesText, titleOfCandidate } from '../importProgress';

const c = (o) => ({ page_from: 1, page_to: 3, status: 'pending', attempts: 0, warnings: [], ...o });
describe('importProgress', () => {
  it('rangesText merges adjacent pages', () => {
    expect(rangesText([c({ page_from: 4, page_to: 6 }), c({ page_from: 7, page_to: 7 }), c({ page_from: 10, page_to: 10 })])).toBe('4–7, 10');
    expect(rangesText([])).toBe('');
  });
  it('counts pages from done leaf chunks only; a split parent is not double counted', () => {
    const chunks = [
      c({ page_from: 1, page_to: 3, status: 'done' }),
      c({ page_from: 4, page_to: 6, status: 'split' }),
      c({ page_from: 4, page_to: 4, status: 'done' }), c({ page_from: 5, page_to: 5, status: 'failed' }), c({ page_from: 6, page_to: 6, status: 'processing' }),
      c({ page_from: 7, page_to: 9, status: 'pending' }),
    ];
    const p = computeProgress(chunks, 9);
    expect(p.pagesDone).toBe(4);
    expect(p.percent).toBe(44);
    expect(p.failedText).toBe('5');
    expect(p.current).toEqual({ from: 6, to: 6 });
    expect(p.openChunks).toBe(2);
    expect(p.untouched).toBe(false);
  });
  it('current is the earliest pending chunk when none is processing; untouched only before any attempt', () => {
    const p = computeProgress([c({ page_from: 4, page_to: 6 }), c({ page_from: 1, page_to: 3 })], 6);
    expect(p.current).toEqual({ from: 1, to: 3 });
    expect(p.untouched).toBe(true);
    expect(computeProgress([c({ attempts: 1 })], 3).untouched).toBe(false);
  });
  it('reads the missing-questions warning from strings or objects', () => {
    const p = computeProgress([c({ status: 'done', page_from: 1, page_to: 3, warnings: [{ kind: 'possible_missing_questions' }] }), c({ status: 'done', page_from: 4, page_to: 6, warnings: ['possible_missing_questions'] })], 6);
    expect(p.hasMissing).toBe(true);
    expect(p.missingText).toBe('1–6');
    expect(p.percent).toBe(100);
  });
  it('title of a candidate comes from the draft only', () => {
    expect(titleOfCandidate({ draft: { title: '  שאלה 3 ' } })).toBe('שאלה 3');
    expect(titleOfCandidate({ draft: {} })).toBe('');
    expect(titleOfCandidate(null)).toBe('');
  });
});
