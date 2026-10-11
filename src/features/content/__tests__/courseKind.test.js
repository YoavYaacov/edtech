import { describe, expect, it } from 'vitest';
import { showsProgrammingLanguage } from '../courseKind';

describe('showsProgrammingLanguage (R1B-3)', () => {
  const math = { id: 'm', title: 'מתמטיקה', programming_language: null, course_languages: [] };
  const cs = { id: 'c', title: 'מדעי המחשב', programming_language: 'java', course_languages: [{ programming_language: 'java' }] };
  it('hides the field for a course with no language and no code content (maths)', () => {
    expect(showsProgrammingLanguage(math, { hasCodeQuestions: false })).toBe(false);
  });
  it('shows it for any course with a configured language', () => {
    expect(showsProgrammingLanguage(cs, { hasCodeQuestions: false })).toBe(true);
    expect(showsProgrammingLanguage({ ...math, course_languages: [{ programming_language: 'python' }] }, { hasCodeQuestions: false })).toBe(true);
  });
  it('never hides it from a programming course just because its classification is missing', () => {
    expect(showsProgrammingLanguage(math, { hasCodeQuestions: true })).toBe(true); // unconfigured, but holds code questions
    expect(showsProgrammingLanguage(math, { hasCodeQuestions: false, questionLanguage: 'java' })).toBe(true); // stored value is kept visible
    expect(showsProgrammingLanguage(math, { hasCodeQuestions: false, neutral: true })).toBe(true);
  });
  it('fails open for an unknown course', () => {
    expect(showsProgrammingLanguage(null, { hasCodeQuestions: false })).toBe(true);
    expect(showsProgrammingLanguage(undefined)).toBe(true);
  });
  it('does not depend on the course name', () => {
    expect(showsProgrammingLanguage({ ...math, title: 'Java' }, { hasCodeQuestions: false })).toBe(false);
  });
});
