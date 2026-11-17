import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { MemoryRouter as Router } from 'react-router-dom';
const render = (ui) => rtlRender(<Router>{ui}</Router>);

const api = vi.hoisted(() => ({ fetchEnrollments: vi.fn(), deleteClass: vi.fn(), createClass: vi.fn(), setClassMember: vi.fn() }));
vi.mock('../contentApi', () => api);
HTMLDialogElement.prototype.showModal ||= function () { this.open = true; };
HTMLDialogElement.prototype.close ||= function () { this.open = false; };

import ClassesPanel from '../ClassesPanel';

const classes = [{ id: 'k1', title: 'כיתה א', members: [{ student_id: 's1' }, { student_id: 's2' }] }];
beforeEach(() => {
  window.sessionStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchEnrollments.mockResolvedValue({ data: [], error: null });
});

vi.mock('../../classes/classesApi', () => ({
  fetchActiveJoinLink: vi.fn().mockResolvedValue({ data: null, error: null }),
  listJoinRequests: vi.fn().mockResolvedValue({ data: [], error: null }),
  joinUrl: (t) => t,
}));

describe('ClassesPanel', () => {
  it('every class card has a visible join-link button that opens the join link panel', async () => {
    render(<ClassesPanel courseId="c1" classes={classes} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /כיתות/ }));
    fireEvent.click(screen.getByRole('button', { name: /קישור הצטרפות ורשימה/ }));
    expect(await screen.findByText(/אין קישור פעיל/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'יצירת קישור' })).toBeTruthy();
  });

  it('is collapsed by default and toggles on click', async () => {
    render(<ClassesPanel courseId="c1" classes={classes} onChanged={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /כיתות/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('delete asks for confirmation (states what is and is not removed) and only then calls the atomic RPC', async () => {
    api.deleteClass.mockResolvedValue({ data: { deleted: true }, error: null });
    const onChanged = vi.fn();
    render(<ClassesPanel courseId="c1" classes={classes} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /כיתות/ }));
    fireEvent.click(screen.getByRole('button', { name: /מחיקת כיתה: כיתה א/ }));
    expect(api.deleteClass).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('2 תלמידים יוסרו מהכיתה');
    expect(document.body.textContent).toContain('התלמידים, המקצוע והנושאים לא יימחקו');
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת הכיתה' }));
    await waitFor(() => expect(api.deleteClass).toHaveBeenCalledWith('k1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('cancel does nothing', () => {
    render(<ClassesPanel courseId="c1" classes={classes} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /כיתות/ }));
    fireEvent.click(screen.getByRole('button', { name: /מחיקת כיתה: כיתה א/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(api.deleteClass).not.toHaveBeenCalled();
  });
});
