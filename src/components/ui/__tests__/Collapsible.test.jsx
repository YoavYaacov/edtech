import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Collapsible from '../Collapsible';
import { readOpen } from '../../../lib/useCollapsed';

afterEach(() => { window.sessionStorage.clear(); });

describe('Collapsible', () => {
  it('starts with the default state and toggles with aria-expanded', () => {
    render(<Collapsible title="נושאים" storageKey="t1" defaultOpen={false}><p>תוכן</p></Collapsible>);
    const btn = screen.getByRole('button', { name: /נושאים/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-controls');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('remembers the choice for the session only (sessionStorage, not localStorage)', () => {
    const { unmount } = render(<Collapsible title="א" storageKey="t2" defaultOpen={false}><p>x</p></Collapsible>);
    fireEvent.click(screen.getByRole('button'));
    expect(readOpen('t2', false)).toBe(true);
    expect(window.localStorage.length).toBe(0);
    unmount();
    render(<Collapsible title="א" storageKey="t2" defaultOpen={false}><p>x</p></Collapsible>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('works when sessionStorage throws', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try {
      render(<Collapsible title="א" storageKey="t3" defaultOpen><p>x</p></Collapsible>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    } finally { Storage.prototype.getItem = orig; }
  });

  it('forceOpen keeps it open and the toggle disabled', () => {
    render(<Collapsible title="א" forceOpen defaultOpen={false}><p>x</p></Collapsible>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('hides closed content from assistive tech', () => {
    render(<Collapsible title="א" defaultOpen={false}><p>סוד</p></Collapsible>);
    expect(screen.getByRole('region', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
  });
});
