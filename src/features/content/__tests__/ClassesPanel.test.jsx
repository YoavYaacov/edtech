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
  Object.values(ta).forEach((f) => f.mockReset());
  ta.taGroups.mockResolvedValue({ data: { ok: false, reason: 'not_available' }, error: null });
  ta.taPreview.mockResolvedValue({ data: { ok: true, group: 'g', items: [], linked: 0, without_id: 0 }, error: null });
});

const ta = vi.hoisted(() => ({ taGroups: vi.fn(), taPreview: vi.fn(), taLinkGroup: vi.fn(), taApply: vi.fn(), taUnlink: vi.fn() }));
vi.mock('../../classes/classesApi', () => ({
  fetchActiveJoinLink: vi.fn().mockResolvedValue({ data: null, error: null }),
  listJoinRequests: vi.fn().mockResolvedValue({ data: [], error: null }),
  joinUrl: (t) => t,
  ...ta,
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

  it('hides every TeacherApp control for anyone who is not the TeacherApp owner', async () => {
    render(<ClassesPanel courseId="c1" classes={classes} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /כיתות/ }));
    await waitFor(() => expect(ta.taGroups).toHaveBeenCalled());
    expect(screen.queryByTestId('ta-link-form')).toBeNull();
    expect(screen.queryByText(/מקושרת ל־TeacherApp/)).toBeNull();
  });

  it('offers unlinked TeacherApp groups, and shows the sync panel on a class that is linked to one', async () => {
    ta.taGroups.mockResolvedValue({ data: { ok: true, groups: [
      { id: 'g1', name: 'קבוצה מקושרת', students: 20, class_id: 'k1' }, { id: 'g2', name: 'קבוצה חדשה', students: 9, class_id: null }] }, error: null });
    render(<ClassesPanel courseId="c1" classes={classes} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /כיתות/ }));
    expect(await screen.findByText('מקושרת ל־TeacherApp: קבוצה מקושרת')).toBeTruthy();
    const form = await screen.findByTestId('ta-link-form');
    expect(form.textContent).toContain('קבוצה חדשה');
    expect(form.textContent).not.toContain('קבוצה מקושרת');
  });
});

