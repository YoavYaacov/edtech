import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ fetchTeacherClasses: vi.fn() }));
vi.mock('../classesApi', () => api);
import TeacherClassesPage from '../TeacherClassesPage';

beforeEach(() => api.fetchTeacherClasses.mockReset());

describe('TeacherClassesPage', () => {
  it('lists every class with its subject and links to the board', async () => {
    api.fetchTeacherClasses.mockResolvedValue({ data: [
      { id: 'k1', title: 'כיתה א', course_id: 'c1', course: { title: 'מתמטיקה' }, members: [{ student_id: 's1' }, { student_id: 's2' }] }], error: null });
    render(<MemoryRouter><TeacherClassesPage /></MemoryRouter>);
    expect(await screen.findByText(/מתמטיקה · 2 תלמידים/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'לוח הכיתה' }).getAttribute('href')).toBe('/teacher/classes/k1');
    expect(screen.getByRole('link', { name: 'ניהול הכיתה' }).getAttribute('href')).toBe('/teacher/courses/c1');
  });
  it('empty state points to the subjects', async () => {
    api.fetchTeacherClasses.mockResolvedValue({ data: [], error: null });
    render(<MemoryRouter><TeacherClassesPage /></MemoryRouter>);
    expect(await screen.findByText('אין עדיין כיתות.')).toBeTruthy();
  });
});
