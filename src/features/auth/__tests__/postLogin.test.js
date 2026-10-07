import { describe, expect, it } from 'vitest';
import { isSharedLink, postLoginPath } from '../postLogin';

const id = '0b6f2a52-6a43-4a0b-9f7e-0f6d6a1b2c3d';
describe('postLoginPath', () => {
  it('no remembered page => the root (which sends each role to its dashboard)', () => {
    expect(postLoginPath(undefined)).toBe('/');
    expect(postLoginPath(null, { narrow: true })).toBe('/');
  });
  it('desktop keeps returning to the remembered page (unchanged behaviour)', () => {
    expect(postLoginPath('/teacher/questions', { narrow: false })).toBe('/teacher/questions');
    expect(postLoginPath('/teacher/questions/import/new')).toBe('/teacher/questions/import/new');
  });
  it('phone: lists, forms, imports and the editor go to the dashboard; shared assignment links are honoured', () => {
    for (const p of ['/teacher/questions', '/teacher/questions/import/new', '/teacher/review', '/student', `/teacher/questions/import/${id}`, `/teacher/questions/${id}`]) expect(postLoginPath(p, { narrow: true })).toBe('/');
    expect(postLoginPath(`/student/assignments/${id}`, { narrow: true })).toBe(`/student/assignments/${id}`);
    expect(postLoginPath(`/teacher/assignments/${id}/review`, { narrow: true })).toBe(`/teacher/assignments/${id}/review`);
  });
  it('never follows an unsafe target', () => {
    for (const p of ['//evil.example', 'https://evil.example', '/login', 5, '']) expect(postLoginPath(p)).toBe('/');
  });
  it('only shared assignment links count as shared links', () => {
    expect(isSharedLink(`/student/assignments/${id}`)).toBe(true);
    expect(isSharedLink(`/teacher/assignments/${id}/review`)).toBe(true);
    expect(isSharedLink(`/teacher/assignments/${id}/other`)).toBe(false);
    expect(isSharedLink('/teacher/assignments/new')).toBe(false);
  });
});
