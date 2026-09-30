import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { ToastHost, dismissToast, showToast } from '../Toast';

afterEach(() => { dismissToast(); vi.useRealTimers(); });

describe('Toast', () => {
  it('is announced politely (role=status inside an aria-live host), can be dismissed, and is replaced by a newer one', () => {
    const { container } = render(<ToastHost />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    act(() => { showToast('המטלה פורסמה בהצלחה'); });
    expect(screen.getByRole('status')).toHaveTextContent('המטלה פורסמה בהצלחה');
    act(() => { showToast('שנייה'); });
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('שנייה');
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('auto-dismisses', () => {
    vi.useFakeTimers();
    render(<ToastHost />);
    act(() => { showToast('x', { durationMs: 1000 }); });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is fixed to the viewport (visible however low the page is) and uses the mint success palette', () => {
    const css = readFileSync('src/components/ui/Toast.module.css', 'utf8');
    expect(css).toMatch(/\.host \{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.success \{[^}]*mint/);
  });

  it('a toast shown before a navigation survives it (host lives in the app shell, state is module-level)', () => {
    act(() => { showToast('נוצרה טיוטה'); });
    render(<ToastHost />);
    expect(screen.getByRole('status')).toHaveTextContent('נוצרה טיוטה');
  });
});
