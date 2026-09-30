import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SegmentedControl from '../SegmentedControl';

const opts = [{ value: 'java', label: 'Java' }, { value: 'csharp', label: 'C#' }];

describe('SegmentedControl', () => {
  it('is a radiogroup with the current value checked and roving tabindex', () => {
    render(<SegmentedControl label="שפה" value="java" options={opts} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'שפה' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Java' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Java' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'C#' })).toHaveAttribute('tabindex', '-1');
  });
  it('changes on click and does not fire for the current value', () => {
    const fn = vi.fn();
    render(<SegmentedControl label="שפה" value="java" options={opts} onChange={fn} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Java' }));
    expect(fn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'C#' }));
    expect(fn).toHaveBeenCalledWith('csharp');
  });
  it('arrow keys follow the visual direction in RTL and Home/End work', () => {
    document.documentElement.dir = 'rtl';
    const fn = vi.fn();
    render(<SegmentedControl label="שפה" value="java" options={opts} onChange={fn} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Java' }), { key: 'ArrowLeft' });
    expect(fn).toHaveBeenLastCalledWith('csharp');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Java' }), { key: 'End' });
    expect(fn).toHaveBeenLastCalledWith('csharp');
    document.documentElement.dir = '';
  });
  it('is inert when disabled', () => {
    render(<SegmentedControl label="שפה" value="java" options={opts} onChange={() => {}} disabled />);
    expect(screen.getByRole('radio', { name: 'C#' })).toBeDisabled();
  });
});
