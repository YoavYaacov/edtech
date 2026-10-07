import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../importsApi', () => ({
  fetchImport: vi.fn(), fetchCandidates: vi.fn(), saveCandidateDraft: vi.fn(), approveCandidate: vi.fn(), rejectCandidate: vi.fn(),
}));
vi.mock('../../content/contentApi', async () => ({
  fetchCourse: vi.fn(async () => ({ data: { id: 'c1', programming_language: 'java', course_languages: [] }, error: null })),
  fetchTopics: vi.fn(async () => ({ data: [{ id: 't1', title: 'דמיון משולשים', parent_id: null, is_archived: false, sort_order: 1, level: 1 }], error: null })),
  courseLanguageList: (c) => (c?.programming_language ? [c.programming_language] : []),
}));
vi.mock('../PdfPageView', () => ({ default: ({ startPage }) => <div>PDFVIEW page {startPage}</div> }));
import ImportReviewPage from '../ImportReviewPage';
import * as api from '../importsApi';

HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
const imp = { id: 'i1', course_id: 'c1', source_name: 'בגרות', status: 'review', archived_at: null, import_files: [{ id: 'f', original_name: 'g.pdf', page_count: 14, storage_path: 'u/i1/source.pdf' }] };
const cand = (o) => ({
  id: 'a', ordinal: 1, source_pages: [3], source_label: '1', source_text: 'טקסט מקור א', flags: [], review_status: 'pending', approved_question_id: null,
  duplicate_of_question_id: null, duplicate_score: null, created_at: '2026-10-07T10:00:00Z',
  proposal: { title: 'שאלה א', body_md: 'גוף א', question_type: 'text', topic_ids: ['t1'] }, draft: { title: 'שאלה א', body_md: 'גוף א', question_type: 'text', topic_ids: ['t1'] }, ...o,
});
let data;
function mount(path = '/teacher/questions/import/i1/review') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teacher/questions/import/:importId/review" element={<ImportReviewPage />} />
        <Route path="/teacher/questions/import/:importId" element={<div>RUN</div>} />
      </Routes>
    </MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  data = [
    cand({ id: 'a', source_pages: [3] }),
    cand({ id: 'b', ordinal: 2, source_pages: [4], source_text: 'טקסט מקור ב', proposal: { title: 'שאלה ב', body_md: 'גוף ב', question_type: 'text' }, draft: { title: 'שאלה ב', body_md: 'גוף ב', question_type: 'text' },
      flags: [{ kind: 'figure_dependent', severity: 'material', message: '' }] }),
    cand({ id: 'c', ordinal: 3, source_pages: [12], proposal: { title: 'תשובות', body_md: 'x', question_type: 'text' }, draft: { title: 'תשובות', body_md: 'x', question_type: 'text' } }),
  ];
  api.fetchImport.mockResolvedValue({ data: imp, error: null });
  api.fetchCandidates.mockImplementation(async () => ({ data: JSON.parse(JSON.stringify(data)), error: null }));
  api.saveCandidateDraft.mockResolvedValue({ data: { ok: true }, error: null });
  api.approveCandidate.mockResolvedValue({ data: { ok: true, question_id: 'q1', status: 'ready' }, error: null });
  api.rejectCandidate.mockResolvedValue({ data: { ok: true }, error: null });
});

describe('ImportReviewPage', () => {
  it('opens on the first pending proposal and shows its source read-only next to the editable proposal', async () => {
    mount();
    expect(await screen.findByDisplayValue('שאלה א')).toBeInTheDocument();
    expect(screen.getByText('טקסט מקור א')).toBeInTheDocument();
    expect(screen.getByText('הצעה 1 מתוך 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'אישור והוספה למאגר' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'דחיית ההצעה' })).toBeInTheDocument();
  });

  it('approve without a material warning goes straight to approve_import_candidate(id, false) and moves to the next', async () => {
    const user = userEvent.setup(); mount();
    await screen.findByDisplayValue('שאלה א');
    await user.click(screen.getByRole('button', { name: 'אישור והוספה למאגר' }));
    await waitFor(() => expect(api.approveCandidate).toHaveBeenCalledWith('a', false));
    expect(await screen.findByText('השאלה נוספה למאגר כמוכנה.')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('שאלה ב')).toBeInTheDocument();   // advanced to the next pending
    expect(api.rejectCandidate).not.toHaveBeenCalled();
  });

  it('a material warning needs an explicit acknowledgement, and then saves as a draft', async () => {
    const user = userEvent.setup(); mount('/teacher/questions/import/i1/review?c=b');
    await screen.findByDisplayValue('שאלה ב');
    expect(screen.getAllByText(/השאלה מתייחסת לשרטוט/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'אישור והוספה כטיוטה' }));
    expect(api.approveCandidate).not.toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector('dialog[open]')).not.toBeNull());
    const dlg = document.querySelector('dialog[open]');
    const confirm = within(dlg).getByRole('button', { name: 'אישור והוספה כטיוטה', hidden: true });
    expect(confirm).toBeDisabled();
    await user.click(within(dlg).getByRole('checkbox', { hidden: true }));
    await user.click(confirm);
    await waitFor(() => expect(api.approveCandidate).toHaveBeenCalledWith('b', true));
  });

  it('reject asks first, says it cannot be undone, and never approves', async () => {
    const user = userEvent.setup(); mount('/teacher/questions/import/i1/review?c=c');
    await screen.findByDisplayValue('תשובות');
    await user.click(screen.getByRole('button', { name: 'דחיית ההצעה' }));
    expect(await screen.findByText('הצעה שנדחתה לא נכנסת למאגר, ולא ניתן לבטל את הדחייה.', { exact: false })).toBeInTheDocument();
    expect(api.rejectCandidate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'דחייה', hidden: true }));
    await waitFor(() => expect(api.rejectCandidate).toHaveBeenCalledWith('c'));
    expect(api.approveCandidate).not.toHaveBeenCalled();
    expect(await screen.findByText('ההצעה נדחתה ולא תיכנס למאגר.')).toBeInTheDocument();
  });

  it('editing autosaves the draft (whitelisted keys) before approving', async () => {
    const user = userEvent.setup(); mount();
    const title = await screen.findByDisplayValue('שאלה א');
    await user.clear(title); await user.type(title, 'כותרת חדשה');
    await user.click(screen.getByRole('button', { name: 'אישור והוספה למאגר' }));
    await waitFor(() => expect(api.approveCandidate).toHaveBeenCalled());
    const calls = api.saveCandidateDraft.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.at(-1)[0]).toBe('a');
    expect(calls.at(-1)[1].title).toBe('כותרת חדשה');
    expect(Object.keys(calls.at(-1)[1]).every((k) => ['title', 'body_md', 'question_type', 'topic_ids', 'difficulty', 'programming_language', 'hints', 'solution', 'teacher_notes', 'tags', 'source_type', 'source_year', 'starter_code', 'is_language_neutral'].includes(k))).toBe(true);
    // save happened BEFORE approve
    expect(api.saveCandidateDraft.mock.invocationCallOrder.at(-1)).toBeLessThan(api.approveCandidate.mock.invocationCallOrder[0]);
  });

  it('does not approve when the last edit could not be saved', async () => {
    api.saveCandidateDraft.mockResolvedValue({ data: null, error: { message: 'network' } });
    const user = userEvent.setup(); mount();
    const title = await screen.findByDisplayValue('שאלה א');
    await user.type(title, 'x');
    await user.click(screen.getByRole('button', { name: 'אישור והוספה למאגר' }));
    expect(await screen.findByText('השינויים האחרונים לא נשמרו. נסו שוב בעוד רגע.')).toBeInTheDocument();
    expect(api.approveCandidate).not.toHaveBeenCalled();
  });

  it('an empty title blocks approval', async () => {
    const user = userEvent.setup(); mount();
    const title = await screen.findByDisplayValue('שאלה א');
    await user.clear(title);
    expect(screen.getByRole('button', { name: 'אישור והוספה למאגר' })).toBeDisabled();
  });

  it('shows the source page viewer on demand, starting at the proposal page', async () => {
    const user = userEvent.setup(); mount('/teacher/questions/import/i1/review?c=b');
    await screen.findByDisplayValue('שאלה ב');
    expect(screen.queryByText(/PDFVIEW/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'הצגת עמוד המקור' }));
    expect(await screen.findByText('PDFVIEW page 4')).toBeInTheDocument();
  });

  it('approved and rejected proposals are read-only; approved links to the question', async () => {
    data[0].review_status = 'approved'; data[0].approved_question_id = 'q9';
    data[2].review_status = 'rejected';
    const user = userEvent.setup(); mount('/teacher/questions/import/i1/review?c=a');
    expect(await screen.findByText('ההצעה אושרה')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'אישור והוספה למאגר' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'פתיחת השאלה בעורך' })[0]).toHaveAttribute('href', '/teacher/questions/q9');
    await user.click(screen.getByRole('button', { name: /^נדחו/ }));
    await user.click(screen.getByRole('button', { name: /תשובות/ }));
    expect(await screen.findByText('ההצעה נדחתה')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'דחיית ההצעה' })).not.toBeInTheDocument();
  });

  it('warns when the import reached the 60-proposal limit', async () => {
    data = Array.from({ length: 60 }, (_, i) => cand({ id: `x${i}`, ordinal: i + 1, source_pages: [1 + (i % 14)], proposal: { title: `ש${i}`, body_md: 'b' }, draft: { title: `ש${i}`, body_md: 'b' } }));
    mount();
    expect(await screen.findByText('הגעתם למגבלת ההצעות בייבוא')).toBeInTheDocument();
  });

  it('restore replaces the draft with the original proposal', async () => {
    data[0].draft = { ...data[0].draft, title: 'ערוך' };
    const user = userEvent.setup(); mount();
    await screen.findByDisplayValue('ערוך');
    await user.click(screen.getByRole('button', { name: 'שחזור ההצעה המקורית' }));
    await user.click(await screen.findByRole('button', { name: 'שחזור', hidden: true }));
    expect(await screen.findByDisplayValue('שאלה א')).toBeInTheDocument();
  });
});
