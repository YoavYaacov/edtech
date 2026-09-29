import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({
  runAiReview: vi.fn(), getCachedAiReview: vi.fn(() => null), getInflightAiReview: vi.fn(() => null),
  saveFeedbackDraft: vi.fn(async () => ({ data: { ok: true }, error: null })),
  saveFeedbackMetadata: vi.fn(async () => ({ data: { ok: true }, error: null })),
  returnForRevision: vi.fn(async () => ({ data: { ok: true }, error: null })),
  releaseFeedback: vi.fn(), releaseReadyFeedback: vi.fn(), sendFeedbackToStudent: vi.fn(),
}));
vi.mock('../reviewApi', () => api);

import FeedbackForm from '../FeedbackForm';

const ok = (over = {}) => ({
  ok: true, runId: 'r1',
  result: { proposedVerdict: 'needs_fix', teacherAnalysis: 'אבחון', proposedStudentFeedback: 'משוב מוצע לתלמיד',
    recommendReturn: true, returnReason: 'כדאי', needsAttention: false, warnings: [], ...over },
});
const initial = { verdict: '', message: '', note: '', tags: [], ret: false };

function setup({ feedback = null, init = initial } = {}) {
  const onChange = vi.fn();
  const utils = render(
    <FeedbackForm submission={{ id: 'sub-1', attempt_number: 1, feedback }} initial={init} tags={[]} topics={[]}
      solutionSeen={false} onChange={onChange} onSaved={vi.fn()} onConflict={vi.fn()} isLatest answerStatus="submitted"
      assignmentStatus="published" registerFlush={vi.fn()} onDone={vi.fn()} />,
  );
  return { onChange, ...utils };
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockClear?.());
  api.getCachedAiReview.mockReturnValue(null);
  api.getInflightAiReview.mockReturnValue(null);
});

describe('FeedbackForm + AI card', () => {
  it('is shown for a draft, and NOT for already released feedback (metadata mode)', () => {
    const a = setup();
    expect(screen.getByRole('button', { name: 'הצעת AI' })).toBeInTheDocument();
    a.unmount();
    setup({ feedback: { released_at: '2026-09-29T10:00:00Z', verdict: 'correct', message_md: 'x', return_for_revision: false } });
    expect(screen.queryByRole('button', { name: 'הצעת AI' })).toBeNull();
  });

  it('running the AI performs NO workflow action and NO save/return/release, and does not touch the form', async () => {
    api.runAiReview.mockResolvedValue(ok());
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText('אבחון')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1600)); // longer than the autosave debounce (1200ms)
    expect(onChange).not.toHaveBeenCalled();
    expect(api.saveFeedbackDraft).not.toHaveBeenCalled();
    expect(api.saveFeedbackMetadata).not.toHaveBeenCalled();
    expect(api.returnForRevision).not.toHaveBeenCalled();
    expect(api.releaseFeedback).not.toHaveBeenCalled();
    expect(api.releaseReadyFeedback).not.toHaveBeenCalled();
    expect(api.sendFeedbackToStudent).not.toHaveBeenCalled();
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  }, 10000);

  it('teacher explicitly adopts needs_fix: goes through set() — verdict + existing derived ret=true; still no return/release call', async () => {
    api.runAiReview.mockResolvedValue(ok());
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await userEvent.click(await screen.findByRole('button', { name: 'בחירה בהערכה המוצעת' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: 'needs_fix', ret: true }));
    expect(screen.getByRole('radio', { name: 'לתיקון' })).toHaveAttribute('aria-checked', 'true');
    expect(api.returnForRevision).not.toHaveBeenCalled();
    expect(api.releaseFeedback).not.toHaveBeenCalled();
  });

  it('adopting a non-needs_fix verdict keeps ret=false (existing rule unchanged); AI recommendation never sets ret', async () => {
    api.runAiReview.mockResolvedValue(ok({ proposedVerdict: 'partial', recommendReturn: true }));
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await userEvent.click(await screen.findByRole('button', { name: 'בחירה בהערכה המוצעת' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: 'partial', ret: false }));
  });

  it('adopted feedback lands in the existing message field; it is saved only through the ordinary draft autosave, never released', async () => {
    api.runAiReview.mockResolvedValue(ok({ proposedVerdict: 'partial' }));
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await userEvent.click(await screen.findByRole('button', { name: 'השתמש במשוב המוצע' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'משוב מוצע לתלמיד' }));
    await waitFor(() => expect(api.saveFeedbackDraft).toHaveBeenCalledTimes(1), { timeout: 4000 }); // same autosave as typing
    expect(api.saveFeedbackDraft.mock.calls[0][1]).toMatchObject({ message: 'משוב מוצע לתלמיד', ret: false });
    expect(api.releaseFeedback).not.toHaveBeenCalled();
    expect(api.returnForRevision).not.toHaveBeenCalled();
  }, 10000);

  it('AI failure does not block manual review: form stays fully usable', async () => {
    api.runAiReview.mockResolvedValue({ ok: false, errorType: 'quota_exceeded' });
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('מכסת ה-AI');
    await userEvent.click(screen.getByRole('radio', { name: 'נכון חלקית' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: 'partial', ret: false }));
    await userEvent.type(screen.getByRole('textbox', { name: /הודעה לתלמיד/ }), 'שלום');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ message: 'שלום' }));
    expect(screen.getByRole('radio', { name: 'לתיקון' })).toBeEnabled();
  });

  it('manual "לתיקון" still derives ret=true exactly as before Round 1B (regression)', async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole('radio', { name: 'לתיקון' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: 'needs_fix', ret: true }));
    await userEvent.click(screen.getByRole('radio', { name: 'לתיקון' })); // toggle off
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: '', ret: false }));
    expect(api.runAiReview).not.toHaveBeenCalled();
  });
});
