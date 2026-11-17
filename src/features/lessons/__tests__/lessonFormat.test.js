import { describe, expect, it } from 'vitest';
import { assignTopics, normalizeName, slugKey, validateManifest } from '../lessonFormat';

const U = '11111111-1111-1111-1111-111111111111';
const M = '22222222-2222-2222-2222-222222222222';
const S = '33333333-3333-3333-3333-333333333333';
const U2 = '44444444-4444-4444-4444-444444444444';
const courses = [
  { id: 'c1', title: 'מתמטיקה', topics: [
    { id: U, parent_id: null, title: 'גאומטריה' },
    { id: M, parent_id: U, title: 'משולשים' },
    { id: S, parent_id: M, title: 'סכום זוויות' },
    { id: U2, parent_id: null, title: 'אלגברה' },
    { id: '55555555-5555-5555-5555-555555555555', parent_id: U2, title: 'משולשים' },
    { id: '66666666-6666-6666-6666-666666666666', parent_id: U2, title: 'ארכיון', is_archived: true },
  ] },
  { id: 'c2', title: 'מדעי המחשב', topics: [{ id: '77777777-7777-7777-7777-777777777777', parent_id: null, title: 'גאומטריה' }] },
];

describe('manifest', () => {
  it('accepts a valid manifest and ignores unknown fields', () => {
    const { manifest, problems } = validateManifest({ format: 1, lessonId: 'triangle-sum', title: ' כותרת ', topicIds: [M.toUpperCase()], extra: 1 });
    expect(problems).toEqual([]);
    expect(manifest.title).toBe('כותרת');
    expect(manifest.topicIds).toEqual([M]);
    expect(manifest.extra).toBeUndefined();
  });
  it('flags bad ids, bad key, bad paths, wrong format', () => {
    const { problems } = validateManifest({ format: 2, lessonId: 'a b', topicIds: ['x'], topicPaths: [[]] });
    expect(problems).toEqual(expect.arrayContaining(['manifest_format', 'manifest_lesson_id', 'manifest_topic_ids', 'manifest_topic_paths']));
    expect(validateManifest([]).problems).toEqual(['manifest_invalid']);
    expect(validateManifest(null).manifest).toBeNull();
  });
});

describe('names', () => {
  it('normalises niqqud, quotes, maqaf, spaces', () => {
    expect(normalizeName('  מִשׁוּלָּשִׁים ')).toBe(normalizeName('משולשים'));
    expect(normalizeName('מד"ע-חדש')).toBe(normalizeName('מדע חדש'));
    expect(slugKey('סכום  זוויות!')).toBe('סכום-זוויות');
    expect(slugKey('a')).toBeNull();
  });
});

describe('deterministic assignment', () => {
  it('1) valid ids in one subject => assigned by ids (any level, no expansion)', () => {
    expect(assignTopics({ topicIds: [M, S] }, courses)).toEqual({ status: 'assigned', method: 'ids', courseId: 'c1', topicIds: [M, S] });
  });
  it('unknown id or ids from two subjects => manual (never partial)', () => {
    expect(assignTopics({ topicIds: [M, '99999999-9999-9999-9999-999999999999'] }, courses).reason).toBe('unknown_ids');
    expect(assignTopics({ topicIds: [M, '77777777-7777-7777-7777-777777777777'] }, courses).reason).toBe('mixed_courses');
  });
  it('archived topics are not assignable', () => {
    expect(assignTopics({ topicIds: ['66666666-6666-6666-6666-666666666666'] }, courses).status).toBe('manual');
  });
  it('2) exact names under a subject; unique path => assigned', () => {
    expect(assignTopics({ subject: 'מתמטיקה', topicPaths: [['גאומטריה', 'משולשים', 'סכום זוויות']] }, courses))
      .toEqual({ status: 'assigned', method: 'names', courseId: 'c1', topicIds: [S] });
  });
  it('ambiguous name (same title under two units) => manual', () => {
    // a bare unit-level title "משולשים" does not exist; a 2-level path is unique, but searching only the name is not supported
    expect(assignTopics({ subject: 'מתמטיקה', topicPaths: [['משולשים']] }, courses).reason).toBe('path_not_found');
  });
  it('ambiguous path across subjects without a subject => manual', () => {
    expect(assignTopics({ topicPaths: [['גאומטריה']] }, courses).reason).toBe('path_ambiguous');
  });
  it('unknown subject / path => manual', () => {
    expect(assignTopics({ subject: 'פיזיקה', topicPaths: [['גאומטריה']] }, courses).reason).toBe('unknown_subject');
    expect(assignTopics({ subject: 'מתמטיקה', topicPaths: [['אין', 'כזה']] }, courses).reason).toBe('path_not_found');
  });
  it('3) no metadata => manual', () => {
    expect(assignTopics({}, courses)).toEqual({ status: 'manual', reason: 'no_metadata' });
    expect(assignTopics(null, courses).status).toBe('manual');
  });
  it('ids win over paths', () => {
    expect(assignTopics({ topicIds: [M], topicPaths: [['אלגברה']] }, courses).method).toBe('ids');
  });
});
