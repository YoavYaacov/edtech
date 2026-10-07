import { describe, expect, it } from 'vitest';
import {
  applyFormChange, approvalErrorKey, cleanDraft, countByFilter, draftForm, filterCandidates, findMathErrors, flagList,
  hasMaterialFlag, isEdited, nextPendingId, sameJson, sortCandidates,
} from '../reviewModel';

const c = (o) => ({ id: 'x', ordinal: 1, source_pages: [1], created_at: '2026-01-01', review_status: 'pending', flags: [], draft: {}, proposal: {}, ...o });

describe('reviewModel', () => {
  it('cleanDraft keeps only the whitelisted keys (same list as the database)', () => {
    expect(cleanDraft({ title: 'a', body_md: 'b', owner_id: 'evil', status: 'ready', course_id: 'x', hints: [] })).toEqual({ title: 'a', body_md: 'b', hints: [] });
    expect(cleanDraft(null)).toEqual({});
  });

  it('isEdited mirrors the database: any difference from the proposal, key order ignored', () => {
    expect(isEdited(c({ proposal: { title: 'a', body_md: 'b' }, draft: { body_md: 'b', title: 'a' } }))).toBe(false);
    expect(isEdited(c({ proposal: { title: 'a' }, draft: { title: 'a2' } }))).toBe(true);
    expect(sameJson({ a: [1, { b: 2, c: 3 }] }, { a: [1, { c: 3, b: 2 }] })).toBe(true);
  });

  it('sorts by page then ordinal, and filters', () => {
    const list = sortCandidates([c({ id: 'b', source_pages: [5] }), c({ id: 'a', source_pages: [2] }), c({ id: 'a2', source_pages: [2], ordinal: 2 })]);
    expect(list.map((x) => x.id)).toEqual(['a', 'a2', 'b']);
    const mixed = [c({ id: '1' }), c({ id: '2', flags: [{ kind: 'topic_uncertain', severity: 'info' }] }), c({ id: '3', review_status: 'approved' }), c({ id: '4', review_status: 'rejected', flags: [{ kind: 'figure_dependent', severity: 'material' }] })];
    expect(filterCandidates(mixed, 'pending').map((x) => x.id)).toEqual(['1', '2']);
    expect(filterCandidates(mixed, 'attention').map((x) => x.id)).toEqual(['2']);
    expect(filterCandidates(mixed, 'approved').map((x) => x.id)).toEqual(['3']);
    expect(filterCandidates(mixed, 'rejected').map((x) => x.id)).toEqual(['4']);
    expect(countByFilter(mixed)).toEqual({ pending: 2, attention: 1, approved: 1, rejected: 1, all: 4 });
    expect(hasMaterialFlag(mixed[3])).toBe(true);
  });

  it('nextPendingId goes forward, wraps once, and ends with null', () => {
    const list = [c({ id: 'a' }), c({ id: 'b', review_status: 'approved' }), c({ id: 'd' }), c({ id: 'e', review_status: 'rejected' })];
    expect(nextPendingId(list, 'a')).toBe('d');
    expect(nextPendingId(list, 'd')).toBe('a');
    expect(nextPendingId([c({ id: 'z', review_status: 'rejected' })], 'z')).toBeNull();
  });

  it('math check: finds broken formulas, ignores code and valid math', () => {
    expect(findMathErrors('no math here')).toEqual([]);
    expect(findMathErrors('חשבו $\\frac{a}{b}$ ואת $$x^2+1$$')).toEqual([]);
    expect(findMathErrors('שבור: $\\frac{a$ ו-$\\notacommand{x}$').length).toBe(2);
    expect(findMathErrors('```java\nint $x = 1; $y\n```')).toEqual([]);
    expect(findMathErrors('price is $5 and `$weird{`')).toEqual([]);
  });

  it('flagList adds an advisory render error without duplicating', () => {
    const k = c({ flags: [{ kind: 'topic_uncertain', severity: 'info', message: 'm' }] });
    expect(flagList(k, []).map((f) => f.kind)).toEqual(['topic_uncertain']);
    expect(flagList(k, ['x']).map((f) => f.kind)).toEqual(['topic_uncertain', 'math_render_error']);
  });

  it('maps RPC failures to stable keys, never to raw database text', () => {
    expect(approvalErrorKey({ message: 'title_required' })).toBe('titleRequired');
    expect(approvalErrorKey({ message: 'topic_not_in_course' })).toBe('topicNotInCourse');
    expect(approvalErrorKey({ code: '42501', message: 'Not allowed' })).toBe('forbidden');
    expect(approvalErrorKey({ code: 'P0002', message: 'x' })).toBe('notFound');
    expect(approvalErrorKey({ message: 'duplicate key value violates' })).toBe('generic');
  });

  it('form edits write only what the teacher changed; untouched parts stay identical to the proposal', () => {
    const base = { title: 'a', body_md: 'b', question_type: 'code', programming_language: 'java' };
    expect(applyFormChange(base, {})).toEqual(base);
    expect(applyFormChange(base, { hint1: '  ' })).toEqual(base);
    const withHint = applyFormChange(base, { hint1: 'רמז' });
    expect(withHint.hints).toEqual([{ level: 1, content_md: 'רמז' }]);
    expect(applyFormChange(withHint, { hint1: '' })).toEqual(base);
    expect(applyFormChange(base, { hint2: 'ב' }).hints).toEqual([{ level: 2, content_md: 'ב' }]);
    expect(applyFormChange(base, { explanation_md: 'x' }).solution).toEqual({ explanation_md: 'x' });
    expect(applyFormChange({ ...base, solution: { explanation_md: 'x' } }, { explanation_md: '' })).toEqual(base);
    expect(applyFormChange(base, { teacher_notes: 'n' }).teacher_notes).toBe('n');
    expect(applyFormChange(base, { question_type: 'text' })).toEqual({ title: 'a', body_md: 'b', question_type: 'text' });
    expect(applyFormChange(base, { difficulty: 'basic', topic_ids: ['t1'] })).toMatchObject({ difficulty: 'basic', topic_ids: ['t1'] });
  });

  it('draftForm reads defaults like the database does', () => {
    const f = draftForm(c({ draft: { title: 'a', hints: [{ level: 2, content_md: 'h2' }], solution: { solution_code: 'x' } } }), { programming_language: 'java' });
    expect(f).toMatchObject({ title: 'a', question_type: 'text', difficulty: 'intermediate', hint1: '', hint2: 'h2', solution_code: 'x', topic_ids: [] });
  });
});
