import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { studentLessons } from '../../../i18n/he';

const dir = join(__dirname, '..');
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const src = readdirSync(dir).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => [f, code(readFileSync(join(dir, f), 'utf8'))]);

describe('static guards', () => {
  it('no AI anywhere in the lessons code', () => {
    for (const [f, s] of src) expect(s, f).not.toMatch(/openai|anthropic|claude|\bgpt\b|chatbot|completion/i);
  });
  it('lesson frame is only ever sandboxed with scripts; same-origin is never granted', () => {
    for (const [f, s] of src) expect(s, f).not.toMatch(/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
    expect(readFileSync(join(dir, 'LessonFrame.jsx'), 'utf8')).toContain('sandbox={SANDBOX}');
  });
  it('lessons are an interactive lecture: no practice questions or chat inside the lesson UI', () => {
    for (const f of ['LessonFrame.jsx', 'StudentLessonPage.jsx']) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/question|chat|textarea/i);
  });
  it('student-facing lesson strings never say "קורס" (subjects are "מקצוע")', () => {
    expect(JSON.stringify(Object.values(studentLessons).map((v) => (typeof v === 'function' ? v('x') : v)))).not.toContain('קורס');
  });
  it('the shell owns header and navigation: the student lesson page renders no site header of its own', () => {
    expect(readFileSync(join(dir, 'StudentLessonPage.jsx'), 'utf8')).not.toMatch(/<header|PageHeader/);
  });
  it('the frame never sets its own scrollbar (single scroll: the app)', () => {
    expect(readFileSync(join(dir, 'LessonFrame.jsx'), 'utf8')).toContain('scrolling="no"');
  });
});
