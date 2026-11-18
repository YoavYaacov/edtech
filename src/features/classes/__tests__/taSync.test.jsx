import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ taPreview: vi.fn(), taApply: vi.fn(), taUnlink: vi.fn(), taLinkGroup: vi.fn(), taPending: vi.fn() }));
vi.mock('../classesApi', () => api);

HTMLDialogElement.prototype.showModal ||= function () { this.open = true; };
HTMLDialogElement.prototype.close ||= function () { this.open = false; };

import TaSyncPanel from '../TaSyncPanel';
import TaLinkForm from '../TaLinkForm';
import TaChangesBanner from '../TaChangesBanner';

const items = [
  { kind: 'add', key: 'a1', name: 'גור תום', claimed: false, ambiguous: false },
  { kind: 'match', key: 'm1', name: 'כהן דנה', claimed: false, ambiguous: false },
  { kind: 'left', key: 'l1', name: 'בר נועה', claimed: true, ambiguous: false },
  { kind: 'rename', key: 'r1', name: 'לוי אורי', new_name: 'לוי אוריאל', claimed: false, ambiguous: false },
  { kind: 'ambiguous', key: 'x1', name: 'כהן יוסי', claimed: false, ambiguous: true },
];

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.taPreview.mockResolvedValue({ data: { ok: true, group: 'י', items, linked: 1, without_id: 2 }, error: null });
  api.taApply.mockResolvedValue({ data: { ok: true, applied: 3, ignored: 1, skipped: 0 }, error: null });
});

describe('TaSyncPanel', () => {
  it('previews the changes; adds/matches/renames default to apply and a student who left defaults to KEEP', async () => {
    render(<TaSyncPanel classId="c1" groupName="קבוצה י" />);
    expect(await screen.findByText('גור תום')).toBeTruthy();
    expect(screen.getByLabelText(/גור תום/).value).toBe('apply');
    expect(screen.getByLabelText(/בר נועה/).value).toBe('keep');
    expect(screen.getByText(/לוי אורי ← לוי אוריאל/)).toBeTruthy();
    expect(screen.getByText(/כהן יוסי/)).toBeTruthy();
    expect(screen.queryByLabelText(/כהן יוסי/)).toBeNull(); // ambiguous: no automatic action
    expect(screen.getByText(/2 תלמידים ממתינים לת״ז/)).toBeTruthy();
  });

  it('sends exactly the teacher choices (nothing is changed before approval)', async () => {
    render(<TaSyncPanel classId="c1" groupName="קבוצה י" />);
    await screen.findByText('גור תום');
    expect(api.taApply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/בר נועה/), { target: { value: 'remove' } });
    fireEvent.change(screen.getByLabelText(/גור תום/), { target: { value: 'ignore' } });
    expect(screen.getByText(/החשבון והלמידה שלו נשמרים/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'אישור' }));
    await waitFor(() => expect(api.taApply).toHaveBeenCalledTimes(1));
    const [classId, decisions] = api.taApply.mock.calls[0];
    expect(classId).toBe('c1');
    expect(decisions).toEqual([
      { kind: 'add', key: 'a1', action: 'ignore' }, { kind: 'match', key: 'm1', action: 'apply' },
      { kind: 'left', key: 'l1', action: 'remove' }, { kind: 'rename', key: 'r1', action: 'apply' }]);
    expect(await screen.findByText('עודכנו 3, דולגו 1.')).toBeTruthy();
  });

  it('says the class is up to date when there is nothing to do', async () => {
    api.taPreview.mockResolvedValue({ data: { ok: true, group: 'י', items: [], linked: 3, without_id: 0 }, error: null });
    render(<TaSyncPanel classId="c1" groupName="קבוצה י" />);
    expect(await screen.findByText('הכיתה מעודכנת.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'אישור' })).toBeNull();
  });

  it('unlinking asks first and keeps the students', async () => {
    api.taUnlink.mockResolvedValue({ data: { ok: true }, error: null });
    const onUnlinked = vi.fn();
    render(<TaSyncPanel classId="c1" groupName="קבוצה י" onUnlinked={onUnlinked} />);
    await screen.findByText('גור תום');
    fireEvent.click(screen.getByRole('button', { name: 'ניתוק מ־TeacherApp' }));
    expect(api.taUnlink).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'ניתוק' }));
    await waitFor(() => expect(onUnlinked).toHaveBeenCalled());
  });
});

describe('TaLinkForm', () => {
  it('links a group to a new class or an existing one', async () => {
    api.taLinkGroup.mockResolvedValue({ data: { ok: true, class_id: 'k1' }, error: null });
    const onLinked = vi.fn();
    render(<TaLinkForm courseId="co1" groups={[{ id: 'g1', name: 'י 5 יח״ל', students: 27 }]} freeClasses={[{ id: 'c9', title: 'קיימת' }]} onLinked={onLinked} />);
    expect(screen.getByRole('button', { name: 'קישור וסנכרון' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('קבוצה ב־TeacherApp'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'קישור וסנכרון' }));
    await waitFor(() => expect(api.taLinkGroup).toHaveBeenCalledWith('co1', 'g1', null));
    await waitFor(() => expect(onLinked).toHaveBeenCalledWith('k1'));
  });
  it('shows nothing when there is no group to link', () => {
    const { container } = render(<TaLinkForm courseId="co1" groups={[]} freeClasses={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('TaChangesBanner', () => {
  const renderBanner = () => render(<MemoryRouter><TaChangesBanner /></MemoryRouter>);
  it('appears by itself when a class has open changes or groups are unlinked', async () => {
    api.taPending.mockResolvedValue({ data: { ok: true, classes: [{ class_id: 'c1', course_id: 'co1', title: 'י1', pending: 3 }], unlinked_groups: 1 }, error: null });
    renderBanner();
    expect(await screen.findByText(/שינויים ב־TeacherApp בכיתה "י1": 3/)).toBeTruthy();
    expect(screen.getByText(/קבוצה אחת ב־TeacherApp שעדיין לא מקושרת/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'לבדיקה' })[0].getAttribute('href')).toBe('/teacher/courses/co1');
  });
  it('is invisible for anyone who is not the TeacherApp owner, and when there is nothing to report', async () => {
    api.taPending.mockResolvedValue({ data: { ok: false, reason: 'not_available' }, error: null });
    const { container } = renderBanner();
    await waitFor(() => expect(api.taPending).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});

describe('TaSyncPanel: ID sync kinds', () => {
  const idItems = [
    { kind: 'id_fill', key: 'f1', name: 'גל גלי', claimed: false, ambiguous: false },
    { kind: 'id_conflict', key: 'c1', name: 'ברק בר', claimed: false, ambiguous: false },
    { kind: 'id_conflict_claimed', key: 'k1', name: 'דור דן', claimed: true, ambiguous: false },
  ];
  it('fill/conflict default to apply; a registered student\'s conflict has no action and is never sent; no ID is shown', async () => {
    api.taPreview.mockResolvedValue({ data: { ok: true, group: 'י', items: idItems, linked: 3, without_id: 0, ta_without_id: 2 }, error: null });
    api.taApply.mockResolvedValue({ data: { ok: true, applied: 2, ignored: 0, skipped: 1, id_skipped: 1 }, error: null });
    const { container } = render(<TaSyncPanel classId="c1" groupName="קבוצה י" />);
    expect(await screen.findByText('גל גלי')).toBeTruthy();
    expect(screen.getByLabelText(/גל גלי/).value).toBe('apply');
    expect(screen.getByLabelText(/ברק בר/).value).toBe('apply');
    expect(screen.getByText(/דור דן/)).toBeTruthy();
    expect(screen.queryByLabelText(/דור דן/)).toBeNull();
    expect(screen.getByText(/ל־2 תלמידים אין ת״ז ב־TeacherApp/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d{5,}/);
    fireEvent.click(screen.getByRole('button', { name: 'אישור' }));
    await waitFor(() => expect(api.taApply).toHaveBeenCalledTimes(1));
    expect(api.taApply.mock.calls[0][1]).toEqual([{ kind: 'id_fill', key: 'f1', action: 'apply' }, { kind: 'id_conflict', key: 'c1', action: 'apply' }]);
    expect(await screen.findByText(/ת״ז אחת לא הועברה/)).toBeTruthy();
  });
});
