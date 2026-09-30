import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ fetchCourses: vi.fn(), createCourse: vi.fn(), reorderCourses: vi.fn() }));
vi.mock('../contentApi', async (orig) => ({ ...(await orig()), ...api }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'teacher' } }) }));

import CoursesPage from '../CoursesPage';

const course = (id, title, primary, langs, extra = {}) => ({
  id, title, code: null, programming_language: primary, is_archived: false, topics: [{ count: 3 }],
  course_languages: langs.map((l) => ({ programming_language: l })), ...extra,
});
const COURSES = [
  course('c1', 'מדעי המחשב', 'java', ['java', 'csharp']),
  course('c2', 'Python בסיסי', 'python', ['python']),
  course('c3', 'מתמטיקה', null, []),
];

const renderPage = () => render(<MemoryRouter><CoursesPage /></MemoryRouter>);
beforeEach(() => {
  window.sessionStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchCourses.mockResolvedValue({ data: COURSES, error: null });
  api.reorderCourses.mockResolvedValue({ data: null, error: null });
});

const cardOf = (title) => screen.getByRole('link', { name: new RegExp(title) });

describe('CoursesPage — languages on the card', () => {
  it('a multi-language course shows ALL its languages (Java and C#), single-language one only its own, no-language none', async () => {
    renderPage();
    const multi = await screen.findByRole('link', { name: /מדעי המחשב/ });
    expect(within(multi).getByText(/Java/)).toBeInTheDocument();
    expect(within(multi).getByText(/C#/)).toBeInTheDocument();
    const single = cardOf('Python בסיסי');
    expect(within(single).getAllByText(/Python/)).toHaveLength(2);   // title + language badge
    expect(within(single).queryByText(/C#/)).toBeNull();
    const none = cardOf('מתמטיקה');
    expect(within(none).queryByText(/Java/)).toBeNull();
  });

  it('is not tied to a particular course: a NEW Java+C# course shows both languages too', async () => {
    api.fetchCourses.mockResolvedValue({ data: [course('n1', 'יסודות מדעי המחשב', 'java', ['java', 'csharp'])], error: null });
    renderPage();
    const card = await screen.findByRole('link', { name: /יסודות מדעי המחשב/ });
    expect(within(card).getByText(/C#/)).toBeInTheDocument();
  });
});

describe('CoursesPage — manual ordering mode', () => {
  it('is an explicit mode: normal view has links, ordering mode has none (no accidental navigation)', async () => {
    renderPage();
    await screen.findByRole('link', { name: /מדעי המחשב/ });
    fireEvent.click(screen.getByRole('button', { name: /סידור קורסים/ }));
    expect(screen.queryByRole('link', { name: /מדעי המחשב/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'סידור הקורסים' })).toBeInTheDocument();
  });

  it('moves with arrows, saves the new order, and first/last arrows are disabled', async () => {
    renderPage();
    await screen.findByRole('link', { name: /מדעי המחשב/ });
    fireEvent.click(screen.getByRole('button', { name: /סידור קורסים/ }));
    expect(screen.getByRole('button', { name: /הזזה למעלה: מדעי המחשב/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /הזזה למטה: מתמטיקה/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /שמירת הסדר/ })).toBeDisabled();       // nothing changed yet
    fireEvent.click(screen.getByRole('button', { name: /הזזה למעלה: Python בסיסי/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Python בסיסי הוזז למקום 1 מתוך 3');
    fireEvent.click(screen.getByRole('button', { name: /שמירת הסדר/ }));
    await waitFor(() => expect(api.reorderCourses).toHaveBeenCalledWith(['c2', 'c1', 'c3']));
  });

  it('cancel saves nothing; archived courses are not part of the arrangement', async () => {
    api.fetchCourses.mockResolvedValue({ data: [...COURSES, course('c4', 'ישן', 'java', ['java'], { is_archived: true })], error: null });
    renderPage();
    await screen.findByRole('link', { name: /מדעי המחשב/ });
    fireEvent.click(screen.getByRole('button', { name: /סידור קורסים/ }));
    expect(screen.queryByText('ישן')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ביטול/ }));
    expect(api.reorderCourses).not.toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: /מדעי המחשב/ })).toBeInTheDocument();
  });

  it('shows an error and stays in the mode when saving fails', async () => {
    api.reorderCourses.mockResolvedValue({ data: null, error: { message: 'x' } });
    renderPage();
    await screen.findByRole('link', { name: /מדעי המחשב/ });
    fireEvent.click(screen.getByRole('button', { name: /סידור קורסים/ }));
    fireEvent.click(screen.getByRole('button', { name: /הזזה למטה: מדעי המחשב/ }));
    fireEvent.click(screen.getByRole('button', { name: /שמירת הסדר/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('שמירת הסדר נכשלה');
  });

  it('the ordering action is hidden with fewer than two active courses', async () => {
    api.fetchCourses.mockResolvedValue({ data: [COURSES[0]], error: null });
    renderPage();
    await screen.findByRole('link', { name: /מדעי המחשב/ });
    expect(screen.queryByRole('button', { name: /סידור קורסים/ })).toBeNull();
  });
});
