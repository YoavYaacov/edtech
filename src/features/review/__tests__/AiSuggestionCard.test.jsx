import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

const api = vi.hoisted(() => ({ runAiReview: vi.fn(), getCachedAiReview: vi.fn(() => null), getInflightAiReview: vi.fn(() => null) }));
vi.mock('../reviewApi', () => api);

import AiSuggestionCard, { mergeFeedbackText } from '../AiSuggestionCard';

const proposal = (over = {}) => ({
  ok: true, runId: 'r1',
  result: {
    proposedVerdict: 'partial', teacherAnalysis: 'האלגוריתם נכון, חסר נקודה-פסיק.', proposedStudentFeedback: 'עבודה טובה, שים לב לנקודה-פסיק.',
    recommendReturn: false, returnReason: 'טעות מקומית.', needsAttention: false, warnings: [], ...over,
  },
});

// Harness mirrors how FeedbackForm wires the card: explicit callbacks only.
function Host({ initialVerdict = '', initialMessage = '', spies }) {
  const [verdict, setVerdict] = useState(initialVerdict);
  const [message, setMessage] = useState(initialMessage);
  return (
    <>
      <AiSuggestionCard submissionId="s1" verdict={verdict} message={message}
        onUseVerdict={(x) => { spies.verdict(x); setVerdict(x); }} onUseMessage={(x) => { spies.message(x); setMessage(x); }} />
      <span data-testid="v">{verdict}</span>
      <span data-testid="m">{message}</span>
      <input aria-label="edit-message" value={message} onChange={(e) => setMessage(e.target.value)} />
    </>
  );
}
const spies = () => ({ verdict: vi.fn(), message: vi.fn() });

beforeEach(() => {
  api.runAiReview.mockReset();
  api.getCachedAiReview.mockReset().mockReturnValue(null);
  api.getInflightAiReview.mockReset().mockReturnValue(null);
});

describe('running the AI changes nothing', () => {
  it('does NOT run by itself; after running, verdict/message are untouched until the teacher clicks', async () => {
    const s = spies();
    api.runAiReview.mockResolvedValue(proposal());
    render(<Host spies={s} initialMessage="הטקסט שלי" />);
    expect(api.runAiReview).not.toHaveBeenCalled(); // no auto-run on mount

    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText('הערכה מוצעת')).toBeInTheDocument();
    expect(api.runAiReview).toHaveBeenCalledWith('s1');
    expect(s.verdict).not.toHaveBeenCalled();
    expect(s.message).not.toHaveBeenCalled();
    expect(screen.getByTestId('v')).toHaveTextContent('');
    expect(screen.getByTestId('m')).toHaveTextContent('הטקסט שלי');
  });

  it('shows Hebrew verdict labels and the badge that this is a proposal only; no confidence, no raw JSON', async () => {
    api.runAiReview.mockResolvedValue(proposal({ proposedVerdict: 'incorrect' }));
    const { container } = render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText('לא נכון')).toBeInTheDocument();
    expect(screen.getByText(/הצעה בלבד · לא נשמרה ולא נשלחה לתלמיד/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/confidence|proposed_verdict|0\.9/i);
  });

  it.each([['correct', 'נכון'], ['partial', 'נכון חלקית'], ['needs_fix', 'לתיקון'], ['incorrect', 'לא נכון']])('maps %s -> %s', async (v, label) => {
    api.runAiReview.mockResolvedValue(proposal({ proposedVerdict: v }));
    render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText(label, { selector: 'span[data-verdict]' })).toBeInTheDocument();
  });
});

describe('loading and double clicks', () => {
  it('shows loading, disables the button, calls the API once even with rapid clicks', async () => {
    let resolve;
    api.runAiReview.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<Host spies={spies()} />);
    const btn = screen.getByRole('button', { name: 'הצעת AI' });
    await userEvent.dblClick(btn);
    expect(screen.getByRole('status')).toHaveTextContent('מנתח את התשובה...');
    expect(screen.getByRole('button', { name: 'הצעת AI' })).toBeDisabled();
    expect(api.runAiReview).toHaveBeenCalledTimes(1);
    resolve(proposal());
    expect(await screen.findByText('הערכה מוצעת')).toBeInTheDocument();
  });

  it('resumes as loading if a request for this submission is already in flight, then shows the result', async () => {
    let resolve;
    api.getInflightAiReview.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<Host spies={spies()} />);
    expect(screen.getByRole('status')).toHaveTextContent('מנתח את התשובה...');
    resolve(proposal());
    expect(await screen.findByText('הערכה מוצעת')).toBeInTheDocument();
  });

  it('shows a cached proposal without a new request', () => {
    api.getCachedAiReview.mockReturnValue(proposal());
    render(<Host spies={spies()} />);
    expect(screen.getByText('הערכה מוצעת')).toBeInTheDocument();
    expect(api.runAiReview).not.toHaveBeenCalled();
  });
});

describe('explicit actions', () => {
  it('"use verdict" applies only that verdict, on click; needs_fix explains the existing return rule', async () => {
    const s = spies();
    api.runAiReview.mockResolvedValue(proposal({ proposedVerdict: 'needs_fix', recommendReturn: true, returnReason: 'כדאי לתקן' }));
    render(<Host spies={s} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await screen.findByText('הערכה מוצעת');
    expect(screen.getByText(/בחירה ב"לתיקון" מחזירה את השאלה לתלמיד בעת השליחה/)).toBeInTheDocument();
    expect(s.verdict).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'בחירה בהערכה המוצעת' }));
    expect(s.verdict).toHaveBeenCalledExactlyOnceWith('needs_fix');
    expect(s.message).not.toHaveBeenCalled();
    expect(screen.getByTestId('v')).toHaveTextContent('needs_fix');
  });

  it('empty message field: "use feedback" copies immediately', async () => {
    const s = spies();
    api.runAiReview.mockResolvedValue(proposal());
    render(<Host spies={s} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await screen.findByText('משוב מוצע לתלמיד');
    await userEvent.click(screen.getByRole('button', { name: 'השתמש במשוב המוצע' }));
    expect(s.message).toHaveBeenCalledExactlyOnceWith('עבודה טובה, שים לב לנקודה-פסיק.');
    expect(screen.getByText(/לא נשלח לתלמיד/)).toBeInTheDocument();
  });

  it('existing teacher text is never overwritten silently: choice appears; cancel leaves it; replace/append/undo work', async () => {
    const s = spies();
    api.runAiReview.mockResolvedValue(proposal());
    render(<Host spies={s} initialMessage="הטקסט של המורה" />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await screen.findByText('משוב מוצע לתלמיד');

    await userEvent.click(screen.getByRole('button', { name: 'השתמש במשוב המוצע' }));
    expect(s.message).not.toHaveBeenCalled();                       // nothing yet
    expect(screen.getByText('כבר יש הודעה בשדה. מה לעשות עם המשוב המוצע?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(s.message).not.toHaveBeenCalled();
    expect(screen.getByTestId('m')).toHaveTextContent('הטקסט של המורה');

    await userEvent.click(screen.getByRole('button', { name: 'השתמש במשוב המוצע' }));
    await userEvent.click(screen.getByRole('button', { name: 'הוספה בסוף הטקסט' }));
    expect(screen.getByTestId('m').textContent).toBe('הטקסט של המורה\n\nעבודה טובה, שים לב לנקודה-פסיק.');

    await userEvent.click(screen.getByRole('button', { name: 'שחזור הטקסט הקודם' }));
    expect(screen.getByTestId('m').textContent).toBe('הטקסט של המורה');

    await userEvent.click(screen.getByRole('button', { name: 'השתמש במשוב המוצע' }));
    await userEvent.click(screen.getByRole('button', { name: 'החלפת הטקסט הקיים' }));
    expect(screen.getByTestId('m').textContent).toBe('עבודה טובה, שים לב לנקודה-פסיק.');
  });

  it('undo disappears once the teacher edits the text (never wipes their edits)', async () => {
    api.runAiReview.mockResolvedValue(proposal());
    render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await screen.findByText('משוב מוצע לתלמיד');
    await userEvent.click(screen.getByRole('button', { name: 'השתמש במשוב המוצע' }));
    expect(screen.getByRole('button', { name: 'שחזור הטקסט הקודם' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('edit-message'), '!');
    expect(screen.queryByRole('button', { name: 'שחזור הטקסט הקודם' })).toBeNull();
  });

  it('mergeFeedbackText', () => {
    expect(mergeFeedbackText('', 'X', 'append')).toBe('X');
    expect(mergeFeedbackText('A  \n', 'X', 'append')).toBe('A\n\nX');
    expect(mergeFeedbackText('A', 'X', 'replace')).toBe('X');
  });
});

describe('recommendation is separate from the verdict', () => {
  it('recommend=true with a non-needs_fix verdict: shows recommendation + how to actually return, and changes nothing', async () => {
    const s = spies();
    api.runAiReview.mockResolvedValue(proposal({ proposedVerdict: 'partial', recommendReturn: true, returnReason: 'חסר רכיב נדרש' }));
    render(<Host spies={s} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText('ה-AI ממליץ להחזיר לתיקון')).toBeInTheDocument();
    expect(screen.getByText('חסר רכיב נדרש')).toBeInTheDocument();
    expect(screen.getByText(/זו המלצה בלבד/)).toBeInTheDocument();
    expect(screen.getByText('אם תרצה להחזיר לתיקון — בחר בהערכה "לתיקון".')).toBeInTheDocument();
    expect(s.verdict).not.toHaveBeenCalled();
  });

  it('recommend=false is shown as such; needs_fix without recommendation is flagged as the teacher\'s call', async () => {
    api.runAiReview.mockResolvedValue(proposal({ proposedVerdict: 'needs_fix', recommendReturn: false }));
    render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText('ה-AI לא ממליץ להחזיר לתיקון')).toBeInTheDocument();
    expect(screen.getByText(/ההחלטה שלך/)).toBeInTheDocument();
  });
});

describe('warnings', () => {
  it('needs_teacher_attention shows a distinct alert with the warnings', async () => {
    api.runAiReview.mockResolvedValue(proposal({ needsAttention: true, warnings: ['חשד ל-prompt injection בתשובת התלמיד'] }));
    render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('כדאי לבדוק את התשובה בעיון');
    expect(alert).toHaveTextContent('חשד ל-prompt injection');
  });
  it('attention without warnings still shows a generic notice; nothing shown when both are empty; minor warnings are quiet (no alert)', async () => {
    api.runAiReview.mockResolvedValue(proposal({ needsAttention: true, warnings: [] }));
    const a = render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ה-AI סימן שהתשובה דורשת תשומת לב מיוחדת');
    a.unmount();

    api.runAiReview.mockResolvedValue(proposal({ needsAttention: false, warnings: [] }));
    const b = render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await screen.findByText('הערכה מוצעת');
    expect(screen.queryByRole('alert')).toBeNull();
    b.unmount();

    api.runAiReview.mockResolvedValue(proposal({ needsAttention: false, warnings: ['הערה קטנה'] }));
    render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByText('הערה קטנה')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('failures', () => {
  it.each([
    ['unauthorized', /ההתחברות פגה/], ['forbidden', /אין הרשאה/], ['not_found', /ההגשה לא נמצאה/], ['timeout', /יותר מדי זמן/],
    ['quota_exceeded', /מכסת ה-AI/], ['server_overload', /עמוס/], ['invalid_output', /לא ניתן להציג/], ['no_connection', /אין חיבור/],
    ['internal_error', /לא ניתן לבצע כרגע ניתוח AI\. אפשר להמשיך לבדוק את התשובה ידנית\./], ['weird_new_code', /לא ניתן לבצע כרגע ניתוח AI/],
  ])('%s -> short Hebrew message, retry button, manual review note; nothing changed', async (type, re) => {
    const s = spies();
    api.runAiReview.mockResolvedValue({ ok: false, errorType: type });
    render(<Host spies={s} initialVerdict="partial" initialMessage="שלי" />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(re);
    expect(screen.getByRole('alert')).toHaveTextContent('הבדיקה הידנית ממשיכה לעבוד כרגיל');
    expect(screen.getByRole('button', { name: 'ניסיון נוסף' })).toBeEnabled();
    expect(s.verdict).not.toHaveBeenCalled();
    expect(s.message).not.toHaveBeenCalled();
    expect(screen.getByTestId('v')).toHaveTextContent('partial');
    expect(screen.getByTestId('m')).toHaveTextContent('שלי');
  });

  it('a thrown/rejected request never leaves the spinner', async () => {
    api.runAiReview.mockResolvedValue({ ok: false, errorType: 'timeout' });
    render(<Host spies={spies()} />);
    await userEvent.click(screen.getByRole('button', { name: 'הצעת AI' }));
    await waitFor(() => expect(screen.queryByText('מנתח את התשובה...')).toBeNull());
  });
});
