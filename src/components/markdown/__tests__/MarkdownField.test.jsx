import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarkdownField from '../MarkdownField';

// MathLive needs a real browser (custom element + layout), so the panel is replaced by a stub here. The real formula
// editor is exercised in Chromium (see the R1B-3 test report); these tests pin how the shared field talks to it.
vi.mock('../math/MathPanel', () => ({
  default: ({ initialLatex, initialDisplay, isEdit, onApply, onCancel }) => (
    <div data-testid="panel" data-edit={String(isEdit)} data-latex={initialLatex} data-display={String(initialDisplay)}>
      <button onClick={() => onApply('\\binom{n}{k}', false)}>apply-binom</button>
      <button onClick={() => onApply('x^2', true)}>apply-display</button>
      <button onClick={onCancel}>cancel</button>
    </div>
  ),
}));

function Harness({ initial = '', rows = 4 }) {
  const [v, setV] = useState(initial);
  return (<>
    <MarkdownField label="שדה" rows={rows} value={v} onChange={(e) => setV(e.target.value)} />
    <output data-testid="value">{v}</output>
  </>);
}
const field = () => screen.getByRole('textbox', { name: 'שדה' });
const value = () => screen.getByTestId('value').textContent;

describe('MarkdownField — Enter in lists', () => {
  it('continues a numbered list 1, 2, 3', async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.click(field());
    await user.type(field(), '1. אחד{Enter}שניים{Enter}שלושה');
    expect(value()).toBe('1. אחד\n2. שניים\n3. שלושה');
  });
  it('continues bullets and ends the list on an empty item', async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.type(field(), '- א{Enter}ב{Enter}{Enter}סוף');
    expect(value()).toBe('- א\n- ב\nסוף');
  });
  it('plain text Enter is untouched', async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.type(field(), 'שלום{Enter}עולם');
    expect(value()).toBe('שלום\nעולם');
  });
  it('does nothing special inside a code fence', async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.type(field(), '```java{Enter}- x{Enter}int a = f("1. (b)");');
    expect(value()).toBe('```java\n- x\nint a = f("1. (b)");');
  });
  it('Shift+Enter is a normal newline', async () => {
    const user = userEvent.setup(); render(<Harness initial="- a" />);
    await user.click(field()); await user.keyboard('{Control>}{End}{/Control}{Shift>}{Enter}{/Shift}b');
    expect(value()).toBe('- a\nb');
  });
});

describe('MarkdownField — edit / preview', () => {
  it('shows the rendered result and returns to the same text without changing it', async () => {
    const user = userEvent.setup(); render(<Harness initial={'**מודגש** ו-++קו++ ו-$x^2$'} />);
    await user.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }));
    const prev = screen.getByTestId('md-preview');
    expect(prev.querySelector('strong').textContent).toBe('מודגש');
    expect(prev.querySelector('u').textContent).toBe('קו');
    expect(prev.querySelector('.katex')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'עריכה' }));
    expect(field()).toHaveValue('**מודגש** ו-++קו++ ו-$x^2$');
    expect(value()).toBe('**מודגש** ו-++קו++ ו-$x^2$');
  });
  it('previews the current unsaved text, and an empty field shows a hint', async () => {
    const user = userEvent.setup(); render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }));
    expect(screen.getByText('אין עדיין תוכן להצגה.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'עריכה' }));
    await user.type(field(), 'טקסט **חדש**');
    await user.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }));
    expect(screen.getByTestId('md-preview').querySelector('strong').textContent).toBe('חדש');
  });
  it('hides the formatting buttons in preview', async () => {
    const user = userEvent.setup(); render(<Harness />);
    expect(screen.getByRole('button', { name: 'מודגש (Ctrl+B)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }));
    expect(screen.queryByRole('button', { name: 'מודגש (Ctrl+B)' })).toBeNull();
  });
});

describe('MarkdownField — underline', () => {
  it('Ctrl+U wraps the selection in ++ and unwraps it again', async () => {
    const user = userEvent.setup(); render(<Harness initial="abc def" />);
    field().focus(); field().setSelectionRange(0, 3);
    await user.keyboard('{Control>}u{/Control}');
    expect(value()).toBe('++abc++ def');
  });
  it('the toolbar button works too', async () => {
    const user = userEvent.setup(); render(<Harness initial="abc" />);
    field().focus(); field().setSelectionRange(0, 3);
    await user.click(screen.getByRole('button', { name: 'קו תחתון (Ctrl+U)' }));
    expect(value()).toBe('++abc++');
  });
});

describe('MarkdownField — formulas', () => {
  it('Σ opens the panel to INSERT a new formula at the caret and writes $…$', async () => {
    const user = userEvent.setup(); render(<Harness initial="חשבו את " />);
    field().focus(); field().setSelectionRange(8, 8);
    await user.click(screen.getByRole('button', { name: 'נוסחה (Ctrl+M)' }));
    const panel = await screen.findByTestId('panel');
    expect(panel.dataset.edit).toBe('false');
    await user.click(screen.getByText('apply-binom'));
    expect(value()).toBe('חשבו את $\\binom{n}{k}$');
    expect(screen.queryByTestId('panel')).toBeNull();
  });
  it('Ctrl+M with the caret inside a formula opens it for editing and replaces only it', async () => {
    const user = userEvent.setup(); render(<Harness initial="א $x$ ב $y$ ג" />);
    field().focus(); field().setSelectionRange(3, 3);
    await user.keyboard('{Control>}m{/Control}');
    const panel = await screen.findByTestId('panel');
    expect(panel.dataset.edit).toBe('true'); expect(panel.dataset.latex).toBe('x');
    await user.click(screen.getByText('apply-binom'));
    expect(value()).toBe('א $\\binom{n}{k}$ ב $y$ ג');
  });
  it('a caret right after a formula starts a NEW one instead of editing it', async () => {
    const user = userEvent.setup(); render(<Harness initial="$x$" />);
    field().focus(); field().setSelectionRange(3, 3);
    await user.keyboard('{Control>}m{/Control}');
    expect((await screen.findByTestId('panel')).dataset.edit).toBe('false');
  });
  it('a display formula is written on its own lines', async () => {
    const user = userEvent.setup(); render(<Harness initial="לפני" />);
    field().focus(); field().setSelectionRange(4, 4);
    await user.click(screen.getByRole('button', { name: 'נוסחה (Ctrl+M)' }));
    await screen.findByTestId('panel');
    await user.click(screen.getByText('apply-display'));
    expect(value()).toBe('לפני\n$$\nx^2\n$$');
  });
  it('cancel leaves the text exactly as it was', async () => {
    const user = userEvent.setup(); render(<Harness initial="א $x$ ב" />);
    field().focus(); field().setSelectionRange(3, 3);
    await user.keyboard('{Control>}m{/Control}');
    await screen.findByTestId('panel');
    await user.click(screen.getByText('cancel'));
    expect(value()).toBe('א $x$ ב');
  });
  it('clicking a formula in the preview opens it, and applying updates the text', async () => {
    const user = userEvent.setup(); render(<Harness initial="א $x$ ב $y$ ג" />);
    await user.click(screen.getByRole('button', { name: 'תצוגה מקדימה' }));
    const formulas = screen.getByTestId('md-preview').querySelectorAll('.katex');
    await user.click(formulas[1]);
    const panel = await screen.findByTestId('panel');
    expect(panel.dataset.latex).toBe('y');
    await user.click(screen.getByText('apply-binom'));
    await waitFor(() => expect(value()).toBe('א $x$ ב $\\binom{n}{k}$ ג'));
  });
  it('math={false} removes the formula button', () => {
    render(<MarkdownField label="שדה" value="" onChange={() => {}} math={false} />);
    expect(screen.queryByRole('button', { name: 'נוסחה (Ctrl+M)' })).toBeNull();
  });
});
