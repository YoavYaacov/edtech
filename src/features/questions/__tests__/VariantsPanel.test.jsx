import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchQuestionVariants: vi.fn(), saveQuestionVariant: vi.fn(), deleteQuestionVariant: vi.fn(),
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
