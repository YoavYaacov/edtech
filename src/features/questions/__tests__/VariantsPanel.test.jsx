import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchQuestionVariants: vi.fn(), saveQuestionVariant: vi.fn(), deleteQuestionVariant: vi.fn(),
  requestQuestionVariantProposal: vi.fn(), recordAiVariantAction: vi.fn(),
}));
vi.mock('../questionsApi', () => api);

import VariantsPanel from '../VariantsPanel';

const base = {
  body_md: 'כתבו פונקציה שמחזירה את סכום המערך',
  starter_code: 'public static int sum(int[] a) {\n}',
  solution_code: 'int s = 0; for (int x : a) s += x; return s;',
  explanation_md: 'לולאה מצטברת',
  hint1: 'השתמשו בלולאה', hint2: 'אתחלו משתנה ל-0',
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.saveQuestionVariant.mockResolvedValue({ data: 'v1', error: null });
});

describe('VariantsPanel — copy-on-create', () => {
  it('shows base language and which languages are covered / missing', async () => {
    api.fetchQuestionVariants.mockResolvedValue({ data: [], error: null });
    render(<VariantsPanel questionId="q1" languages={['java', 'csharp']} baseLanguage="java" base={base} />);
    expect(await screen.findByText(/חסרה גרסה/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /יצירת גרסה/ })).toBeInTheDocument();
  });

  it('a NEW variant opens pre-filled with the whole base (body, starter, solution, explanation, hints) and saves that copy', async () => {
    api.fetchQuestionVariants.mockResolvedValue({ data: [], error: null });
    render(<VariantsPanel questionId="q1" languages={['java', 'csharp']} baseLanguage="java" base={base} />);
    fireEvent.click(await screen.findByRole('button', { name: /יצירת גרסה/ }));
    expect(screen.getByRole('note')).toHaveTextContent('עותק של שאלת הבסיס');
    expect(screen.getByDisplayValue(base.body_md)).toBeInTheDocument();
    expect(screen.getByDisplayValue(base.explanation_md)).toBeInTheDocument();
    expect(screen.getByDisplayValue(base.hint1)).toBeInTheDocument();
    expect(screen.getByDisplayValue(base.hint2)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /שמירת הגרסה/ }));
    await waitFor(() => expect(api.saveQuestionVariant).toHaveBeenCalledTimes(1));
    const [qid, v] = api.saveQuestionVariant.mock.calls[0];
    expect(qid).toBe('q1');
    expect(v).toMatchObject({
      language: 'csharp', body_md: base.body_md, starter_code: base.starter_code, solution_code: base.solution_code,
      explanation_md: base.explanation_md,
      hints: [{ level: 1, content_md: base.hint1 }, { level: 2, content_md: base.hint2 }],
    });
  });

  it('never creates a variant in the base language (no Java row for a Java question)', async () => {
    api.fetchQuestionVariants.mockResolvedValue({ data: [], error: null });
    render(<VariantsPanel questionId="q1" languages={['java', 'csharp']} baseLanguage="java" base={base} />);
    await screen.findByText(/חסרה גרסה/);
    expect(screen.getAllByRole('button', { name: /יצירת גרסה/ })).toHaveLength(1);   // only C#
  });

  it('an EXISTING variant opens with its own stored content, not with the base', async () => {
    api.fetchQuestionVariants.mockResolvedValue({ data: [{
      id: 'v1', programming_language: 'csharp', body_md: 'גרסת C# של הנוסח', starter_code: 'static int Sum(int[] a) {}',
      solution_code: 'return a.Sum();', explanation_md: 'LINQ', hints: [{ level: 1, content_md: 'השתמשו ב-Sum' }], origin: 'manual' }], error: null });
    render(<VariantsPanel questionId="q1" languages={['java', 'csharp']} baseLanguage="java" base={base} />);
    fireEvent.click(await screen.findByRole('button', { name: /עריכה/ }));
    expect(screen.getByDisplayValue('גרסת C# של הנוסח')).toBeInTheDocument();
    expect(screen.getByDisplayValue('LINQ')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(base.body_md)).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('VariantsPanel — AI-proposed variant (C2)', () => {
  const proposal = {
    ok: true, runId: 'run-1', sourceLanguage: 'java',
    proposal: { language: 'csharp', body_md: 'כתבו שיטה שמחזירה את סכום המערך', starter_code: 'static int Sum(int[] a)\n{\n}',
      solution_code: 'AI-SOLUTION', explanation_md: 'לולאה מצטברת', hints: [{ level: 1, content_md: 'השתמשו בלולאה' }, { level: 2, content_md: 'אתחלו ל-0' }],
      warnings: ['בדקו את הטיפול בקלט'], confidence: 0.8 },
  };
  const renderPanel = () => render(<VariantsPanel questionId="q1" languages={['java', 'csharp']} baseLanguage="java" base={base} />);

  beforeEach(() => { api.fetchQuestionVariants.mockResolvedValue({ data: [], error: null }); });

  it('offers an AI button next to the manual one, and asks the server with the question and target only', async () => {
    api.requestQuestionVariantProposal.mockResolvedValue(proposal);
    renderPanel();
    expect(await screen.findByRole('button', { name: /יצירת גרסה/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /הצע גרסת .*C#.* באמצעות AI/ }));
    await screen.findByText(/הצעת AI/);
    expect(api.requestQuestionVariantProposal).toHaveBeenCalledWith('q1', 'csharp');
  });

  it('shows a loading state, and the proposal is NOT saved until Save is pressed (Base untouched)', async () => {
    let resolve; api.requestQuestionVariantProposal.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    expect(await screen.findByText(/ה-AI מכין הצעה/)).toBeInTheDocument();
    resolve(proposal);
    await screen.findByDisplayValue(proposal.proposal.explanation_md);
    expect(screen.getByText('בדקו את הטיפול בקלט')).toBeInTheDocument();
    expect(screen.getByText(/שאלת הבסיס/)).toBeInTheDocument();           // comparison with the base
    expect(api.saveQuestionVariant).not.toHaveBeenCalled();
    expect(api.deleteQuestionVariant).not.toHaveBeenCalled();
  });

  it('explicit Save of an untouched proposal stores origin ai_proposed and records the action', async () => {
    api.requestQuestionVariantProposal.mockResolvedValue(proposal);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    await screen.findByDisplayValue(proposal.proposal.explanation_md);
    fireEvent.click(screen.getByRole('button', { name: /שמירת הגרסה/ }));
    await waitFor(() => expect(api.saveQuestionVariant).toHaveBeenCalledTimes(1));
    const [, v] = api.saveQuestionVariant.mock.calls[0];
    expect(v).toMatchObject({ language: 'csharp', solution_code: 'AI-SOLUTION', origin: 'ai_proposed',
      hints: [{ level: 1, content_md: 'השתמשו בלולאה' }, { level: 2, content_md: 'אתחלו ל-0' }] });
    await waitFor(() => expect(api.recordAiVariantAction).toHaveBeenCalledWith('run-1', 'saved'));
  });

  it('an edited proposal is saved as ai_proposed_edited', async () => {
    api.requestQuestionVariantProposal.mockResolvedValue(proposal);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    const body = await screen.findByDisplayValue(proposal.proposal.body_md);
    fireEvent.change(body, { target: { value: 'נוסח ערוך' } });
    fireEvent.click(screen.getByRole('button', { name: /שמירת הגרסה/ }));
    await waitFor(() => expect(api.saveQuestionVariant).toHaveBeenCalled());
    expect(api.saveQuestionVariant.mock.calls[0][1]).toMatchObject({ body_md: 'נוסח ערוך', origin: 'ai_proposed_edited' });
    await waitFor(() => expect(api.recordAiVariantAction).toHaveBeenCalledWith('run-1', 'saved_edited'));
  });

  it('discarding the proposal saves nothing and records discarded', async () => {
    api.requestQuestionVariantProposal.mockResolvedValue(proposal);
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    await screen.findByDisplayValue(proposal.proposal.explanation_md);
    fireEvent.click(screen.getByRole('button', { name: /השלכת ההצעה/ }));
    expect(api.saveQuestionVariant).not.toHaveBeenCalled();
    expect(api.recordAiVariantAction).toHaveBeenCalledWith('run-1', 'discarded');
    expect(screen.getByRole('button', { name: /באמצעות AI/ })).toBeInTheDocument();
  });

  it('on AI failure: clear error, nothing saved, the manual path and a retry remain', async () => {
    api.requestQuestionVariantProposal.mockResolvedValue({ ok: false, errorType: 'invalid_output' });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/הבסיס לא השתנה/);
    expect(api.saveQuestionVariant).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /יצירת גרסה/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /באמצעות AI/ })).toBeEnabled();
    // manual path still copies the base
    fireEvent.click(screen.getByRole('button', { name: /יצירת גרסה/ }));
    expect(screen.getByDisplayValue(base.body_md)).toBeInTheDocument();
  });

  it('cancelling while loading drops the late result', async () => {
    let resolve; api.requestQuestionVariantProposal.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: /ביטול הבקשה/ }));
    resolve(proposal);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/הצעת AI/)).not.toBeInTheDocument();
    expect(api.saveQuestionVariant).not.toHaveBeenCalled();
  });

  it('a failed save keeps the proposal on screen and records no action', async () => {
    api.requestQuestionVariantProposal.mockResolvedValue(proposal);
    api.saveQuestionVariant.mockResolvedValue({ data: null, error: { message: 'x' } });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: /באמצעות AI/ }));
    await screen.findByDisplayValue(proposal.proposal.explanation_md);
    fireEvent.click(screen.getByRole('button', { name: /שמירת הגרסה/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('שמירת הגרסה נכשלה');
    expect(screen.getByDisplayValue(proposal.proposal.explanation_md)).toBeInTheDocument();
    expect(api.recordAiVariantAction).not.toHaveBeenCalled();
  });

  it('no AI button for a language that already has a variant', async () => {
    api.fetchQuestionVariants.mockResolvedValue({ data: [{ id: 'v', programming_language: 'csharp', body_md: null, starter_code: '', solution_code: '', explanation_md: '', hints: null, origin: 'manual' }], error: null });
    renderPanel();
    await screen.findByText(/יש גרסה/);
    expect(screen.queryByRole('button', { name: /באמצעות AI/ })).not.toBeInTheDocument();
  });
});
