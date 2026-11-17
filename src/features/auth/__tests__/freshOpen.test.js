import { beforeEach, describe, expect, it } from 'vitest';
import { freshOpenTarget, isFreshOpen, resetFreshOpenForTests } from '../freshOpen';

const id = '0b6f2a52-6a43-4a0b-9f7e-0f6d6a1b2c3d';
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
beforeEach(resetFreshOpenForTests);

describe('fresh open', () => {
  it('is true once per browsing context (a reload of the same tab is not fresh)', () => {
    const s = mem();
    expect(isFreshOpen(s)).toBe(true);
    resetFreshOpenForTests(); // simulates a page reload: module state lost, sessionStorage kept
    expect(isFreshOpen(s)).toBe(false);
  });
  it('blocked storage never redirects', () => {
    expect(isFreshOpen({ getItem() { throw new Error('x'); }, setItem() {} })).toBe(false);
  });
  it('a restored work screen goes to the role dashboard', () => {
    expect(freshOpenTarget('/teacher/questions', '/teacher')).toBe('/teacher');
    expect(freshOpenTarget('/student/library', '/student')).toBe('/student');
    expect(freshOpenTarget('/', '/teacher')).toBe('/teacher');
  });
  it('stays on the dashboard, login, set-password and shared assignment links', () => {
    expect(freshOpenTarget('/teacher', '/teacher')).toBeNull();
    expect(freshOpenTarget('/login', '/teacher')).toBeNull();
    expect(freshOpenTarget('/set-password', '/student')).toBeNull();
    expect(freshOpenTarget(`/student/assignments/${id}`, '/student')).toBeNull();
  });
});
