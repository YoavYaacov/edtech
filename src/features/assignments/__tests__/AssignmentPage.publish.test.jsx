import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const api = vi.hoisted(() => ({
  addAssignmentQuestion: vi.fn(), addRecipient: vi.fn(), deleteAssignment: vi.fn(), fetchAssignment: vi.fn(), fetchAssignmentQuestions: vi.fn(),
  fetchRecipients: vi.fn(), fetchAssignmentLanguageStatus: vi.fn(), publishAssignment: vi.fn(), removeAssignmentQuestion: vi.fn(),
  removeRecipient: vi.fn(), reorderAssignmentQuestions: vi.fn(), setAssignmentClosed: vi.fn(), unpublishAssignment: vi.fn(),
  updateAssignment: vi.fn(), updateAssignmentQuestion: vi.fn(), createAssignment: vi.fn(), fetchAssignments: vi.fn(),
  assignmentClonePreflight: vi.fn(), cloneAssignmentToLanguage: vi.fn(),
}));
vi.mock('../assignmentsApi', () => api);
vi.mock('../../content/contentApi', async () => ({
  courseLanguageList: (c) => (c?.programming_language ? [c.programming_language, ...(c.course_languages ?? []).map((x) => x.programming_language).filter((l) => l !== c.programming_language)] : []),
  fetchEnrollments: vi.fn(async () => ({ data: [], error: null })), fetchTopics: vi.fn(async () => ({ data: [], error: null })), fetchCourses: vi.fn(),
}));
vi.mock('../../questions/questionsApi', () => ({ fetchQuestions: vi.fn(async () => ({ data: [], error: null })) }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 't' } }) }));

import AssignmentPage from '../AssignmentPage';
import { ToastHost, dismissToast } from '../../../components/ui/Toast';

const assignment = (over = {}) => ({ id: 'a1', title: 'לולאות', status: 'draft', course_id: 'c1', programming_language: 'java', due_at: null, instructions_md: '',
  course: { title: 'Java', programming_language: 'java', course_languages: [{ programming_language: 'java' }, { programming_language: 'csharp' }] }, ...over });

function Where() { const l = useLocation(); return <div data-testid="loc">{l.pathname}</div>; }
const renderPage = () => render(
  <MemoryRouter initialEntries={['/teacher/assignments/a1']}>
    <Routes>
      <Route path="/teacher/assignments/:assignmentId" element={<><AssignmentPage /><Where /></>} />
      <Route path="/teacher/assignments" element={<Where />} />
      <Route path="*" element={<Where />} />
    </Routes>
    <ToastHost />
  </MemoryRouter>);

// jsdom has no <dialog>.showModal()/close(): emulate the open attribute the native element would set
HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  dismissToast();
  api.fetchAssignment.mockResolvedValue({ data: assignment(), error: null });
  api.fetchAssignmentQuestions.mockResolvedValue({ data: [], error: null });
  api.fetchRecipients.mockResolvedValue({ data: [], error: null });
  api.fetchAssignmentLanguageStatus.mockResolvedValue({ data: { language: 'java', items: [] }, error: null });
});

async function openPublishDialog() {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'פרסום לתלמידים' }));
  return screen.findByRole('heading', { name: 'לפרסם את המטלה?' }, { hidden: true });
}
const confirmBtn = () => within(document.querySelector('dialog')).getByRole('button', { name: 'פרסום לתלמידים' });

describe('UX FIX 2 — publish feedback', () => {
  it('no questions: the dialog STAYS OPEN, a specific error shows inside it, no success UI', async () => {
    api.publishAssignment.mockResolvedValue({ data: { ok: false, reason: 'no_questions' }, error: null });
    await openPublishDialog();
    fireEvent.click(confirmBtn());
    const dlg = document.querySelector('dialog');
    expect(await within(dlg).findByRole('alert')).toHaveTextContent('לא ניתן לפרסם את המטלה - יש להוסיף לפחות שאלה אחת.');
    expect(dlg.open).toBe(true);
    expect(screen.queryByText('המטלה פורסמה בהצלחה')).toBeNull();
  });

  it('missing variants: names the language and lists the questions with a link to create each variant', async () => {
    api.publishAssignment.mockResolvedValue({ data: { ok: false, reason: 'variants_missing', items: [
      { question_id: 'q1', title: 'חישוב ממוצע', language: 'csharp', kind: 'missing_variant' }] }, error: null });
    api.fetchAssignment.mockResolvedValue({ data: assignment({ programming_language: 'csharp' }), error: null });
    await openPublishDialog();
    fireEvent.click(confirmBtn());
    const alert = await within(document.querySelector('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent(/חסרה גרסת .*C#.* לשאלה/);
    expect(alert).toHaveTextContent('חישוב ממוצע');
    expect(within(alert).getByRole('link')).toHaveAttribute('href', '/teacher/questions/q1?variant=csharp');
    expect(document.querySelector('dialog').open).toBe(true);
  });

  it('network error (thrown) and server error keep the dialog open with distinct messages', async () => {
    api.publishAssignment.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await openPublishDialog();
    fireEvent.click(confirmBtn());
    expect(await within(document.querySelector('dialog')).findByRole('alert')).toHaveTextContent('לא הצלחנו להתחבר לשרת');
    api.publishAssignment.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(within(document.querySelector('dialog')).getByRole('alert')).toHaveTextContent('הפעולה נכשלה בשרת'));
    expect(document.querySelector('dialog').open).toBe(true);
    expect(screen.queryByText('המטלה פורסמה בהצלחה')).toBeNull();
  });

  it('success: only AFTER the server confirms, the dialog closes and a green toast appears', async () => {
    let resolve; api.publishAssignment.mockReturnValue(new Promise((r) => { resolve = r; }));
    await openPublishDialog();
    fireEvent.click(confirmBtn());
    // before confirmation: still open, no toast (no optimistic close)
    expect(document.querySelector('dialog').open).toBe(true);
    expect(screen.queryByText('המטלה פורסמה בהצלחה')).toBeNull();
    await act(async () => { resolve({ data: { ok: true }, error: null }); });
    await waitFor(() => expect(document.querySelector('dialog')?.open ?? false).toBe(false));
    expect(screen.getAllByText('המטלה פורסמה בהצלחה').length).toBeGreaterThan(0);
  });

  it('double click sends ONE publish request', async () => {
    let resolve; api.publishAssignment.mockReturnValue(new Promise((r) => { resolve = r; }));
    await openPublishDialog();
    const b = confirmBtn();
    fireEvent.click(b); fireEvent.click(b); fireEvent.click(b);
    expect(api.publishAssignment).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: { ok: true }, error: null }); });
  });

  it('cancel while a request is running does not close the dialog; cancel after an error does', async () => {
    api.publishAssignment.mockResolvedValue({ data: { ok: false, reason: 'no_students' }, error: null });
    await openPublishDialog();
    fireEvent.click(confirmBtn());
    await within(document.querySelector('dialog')).findByRole('alert');
    fireEvent.click(within(document.querySelector('dialog')).getByRole('button', { name: 'ביטול' }));
    await waitFor(() => expect(document.querySelector('dialog')).toBeNull());
  });
});

describe('C3 — clone to another programming language', () => {
  const open = async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'שכפול לשפת תכנות אחרת' }));
    return document.querySelector('dialog[open], dialog');
  };

  it('the button is offered only when the course has another language', async () => {
    api.fetchAssignment.mockResolvedValue({ data: assignment({ course: { title: 'x', programming_language: 'java', course_languages: [{ programming_language: 'java' }] } }), error: null });
    renderPage();
    await screen.findByRole('button', { name: 'פרסום לתלמידים' });
    expect(screen.queryByRole('button', { name: 'שכפול לשפת תכנות אחרת' })).toBeNull();
  });

  it('only other course languages are offered; success creates a draft and navigates to it with a toast', async () => {
    api.assignmentClonePreflight.mockResolvedValue({ data: { ok: true, language: 'csharp' }, error: null });
    api.cloneAssignmentToLanguage.mockResolvedValue({ data: { ok: true, assignment_id: 'a2' }, error: null });
    await open();
    const select = await screen.findByLabelText('שפת היעד');
    expect([...select.options].map((o) => o.value)).toEqual(['csharp']);
    expect(await screen.findByText(/אפשר לשכפל/)).toBeInTheDocument();
    expect(api.assignmentClonePreflight).toHaveBeenCalledWith('a1', 'csharp');
    fireEvent.click(screen.getByRole('button', { name: 'יצירת טיוטה חדשה' }));
    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/teacher/assignments/a2'));
    expect(api.cloneAssignmentToLanguage).toHaveBeenCalledTimes(1);
    expect(api.cloneAssignmentToLanguage.mock.calls[0].slice(0, 2)).toEqual(['a1', 'csharp']);
    expect(screen.getByText(/נוצרה טיוטה חדשה/)).toBeInTheDocument();
  });

  it('a missing variant blocks the clone: lists the questions with links, the confirm button is disabled, nothing is created', async () => {
    api.assignmentClonePreflight.mockResolvedValue({ data: { ok: false, reason: 'variants_missing', language: 'csharp', items: [
      { question_id: 'q1', title: 'שאלה א', kind: 'missing_variant' }, { question_id: 'q2', title: 'שאלה ב', kind: 'missing_variant' }, { question_id: 'q3', title: 'שאלה ג', kind: 'archived' }] }, error: null });
    await open();
    const alert = await screen.findByText(/לא ניתן לשכפל את המטלה ל-.*C#.*\. חסרות גרסאות .*C#.* ל-3 שאלות/);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('שאלה א')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'פתיחת השאלה ויצירת גרסה' })[0]).toHaveAttribute('href', '/teacher/questions/q1?variant=csharp');
    expect(screen.getAllByRole('link', { name: 'פתיחת השאלה ויצירת גרסה' })).toHaveLength(2); // archived has no link
    expect(screen.getByRole('button', { name: 'יצירת טיוטה חדשה' })).toBeDisabled();
    expect(api.cloneAssignmentToLanguage).not.toHaveBeenCalled();
  });

  it('if the state changed after preflight, the server refuses and the dialog shows the list instead of navigating', async () => {
    api.assignmentClonePreflight.mockResolvedValue({ data: { ok: true }, error: null });
    api.cloneAssignmentToLanguage.mockResolvedValue({ data: { ok: false, reason: 'variants_missing', items: [{ question_id: 'q1', title: 'שאלה א', kind: 'missing_variant' }] }, error: null });
    await open();
    await screen.findByText(/אפשר לשכפל/);
    fireEvent.click(screen.getByRole('button', { name: 'יצירת טיוטה חדשה' }));
    expect(await screen.findByText(/חסרה גרסת .*C#.* לשאלה אחת/)).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/teacher/assignments/a1');
  });

  it('clone failure shows an error and stays on the source', async () => {
    api.assignmentClonePreflight.mockResolvedValue({ data: { ok: true }, error: null });
    api.cloneAssignmentToLanguage.mockResolvedValue({ data: null, error: { message: 'x' } });
    await open();
    await screen.findByText(/אפשר לשכפל/);
    fireEvent.click(screen.getByRole('button', { name: 'יצירת טיוטה חדשה' }));
    expect(await screen.findByText(/השכפול נכשל והמטלה החדשה לא נוצרה/)).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/teacher/assignments/a1');
  });

  it('double click on confirm clones once', async () => {
    api.assignmentClonePreflight.mockResolvedValue({ data: { ok: true }, error: null });
    let resolve; api.cloneAssignmentToLanguage.mockReturnValue(new Promise((r) => { resolve = r; }));
    await open();
    await screen.findByText(/אפשר לשכפל/);
    const b = screen.getByRole('button', { name: 'יצירת טיוטה חדשה' });
    fireEvent.click(b); fireEvent.click(b);
    expect(api.cloneAssignmentToLanguage).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ data: { ok: true, assignment_id: 'a2' }, error: null }); });
  });
});
