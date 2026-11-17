import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ previewJoin: vi.fn(), joinClass: vi.fn(), myIdentity: vi.fn(), completeIdentity: vi.fn() }));
const auth = vi.hoisted(() => ({ value: {} }));
vi.mock('../classesApi', () => api);
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth.value }));

import JoinPage from '../JoinPage';

const TOKEN = 'a'.repeat(32);
const renderAt = (token = TOKEN) => render(
  <MemoryRouter initialEntries={[`/join/${token}`]}><Routes><Route path="/join/:token" element={<JoinPage />} /></Routes></MemoryRouter>,
);
const ok = { status: 'ok', class_title: 'כיתה א', course_title: 'מתמטיקה', requires_approval: false };
const signedOut = () => ({ session: null, profile: null, isInitializing: false, signIn: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), signOut: vi.fn() });
const student = () => ({ session: { user: { id: 's1' } }, profile: { role: 'student' }, isInitializing: false, signOut: vi.fn() });

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.previewJoin.mockResolvedValue({ data: ok, error: null });
  auth.value = signedOut();
});

describe('JoinPage', () => {
  it('malformed token never reaches the server', async () => {
    renderAt('short');
    expect(await screen.findByText(/הקישור אינו תקף/)).toBeTruthy();
    expect(api.previewJoin).not.toHaveBeenCalled();
  });

  it.each([['expired', /תוקף הקישור פג/], ['revoked', /ביטלה את הקישור/], ['full', /מספר ההצטרפויות המרבי/], ['invalid', /הקישור אינו תקף/]])(
    'shows the %s state and offers no login', async (status, re) => {
      api.previewJoin.mockResolvedValue({ data: { status }, error: null });
      renderAt();
      expect(await screen.findByText(re)).toBeTruthy();
      expect(screen.queryByLabelText('אימייל')).toBeNull();
    });

  it('signed out: shows the class and a login/register choice; registering needs the consent box and 8+ chars', async () => {
    renderAt();
    expect(await screen.findByText(/כיתה א/)).toBeTruthy();
    expect(document.body.textContent).toContain('מתמטיקה');
    fireEvent.click(screen.getByRole('tab', { name: 'חשבון חדש' }));
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת חשבון' }));
    expect(await screen.findByText(/צריך לאשר את התנאים/)).toBeTruthy();
    expect(auth.value.signUp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת חשבון' }));
    await waitFor(() => expect(auth.value.signUp).toHaveBeenCalledWith('a@b.co', 'longenough1', expect.stringContaining('/join/')));
    expect(await screen.findByText(/שלחנו אימייל/)).toBeTruthy();
  });

  it('teacher account cannot join', async () => {
    auth.value = { ...student(), profile: { role: 'teacher' } };
    renderAt();
    expect(await screen.findByText(/מחוברים כמורים/)).toBeTruthy();
    expect(api.myIdentity).not.toHaveBeenCalled();
    expect(api.joinClass).not.toHaveBeenCalled();
  });

  it('incomplete identity: validates the ID locally, maps server reasons, then continues to the join button', async () => {
    auth.value = student();
    api.myIdentity.mockResolvedValueOnce({ data: { complete: false }, error: null })
      .mockResolvedValue({ data: { complete: true }, error: null });
    renderAt();
    fireEvent.change(await screen.findByLabelText('שם פרטי'), { target: { value: 'דנה' } });
    fireEvent.change(screen.getByLabelText('שם משפחה'), { target: { value: 'כהן' } });
    fireEvent.change(screen.getByLabelText('מספר תעודת זהות'), { target: { value: '936044503' } });
    expect(screen.getByText(/מספר תעודת הזהות אינו תקין/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'שמירה והמשך' }));
    expect(api.completeIdentity).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('מספר תעודת זהות'), { target: { value: '936044502' } });
    api.completeIdentity.mockResolvedValueOnce({ data: { ok: false, reason: 'id_in_use' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'שמירה והמשך' }));
    expect(await screen.findByText(/כבר רשום בחשבון אחר/)).toBeTruthy();
    api.completeIdentity.mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'שמירה והמשך' }));
    expect(await screen.findByRole('button', { name: 'הצטרפות לכיתה' })).toBeTruthy();
    expect(api.completeIdentity).toHaveBeenLastCalledWith('דנה', 'כהן', '936044502');
  });

  it('joins only after an explicit click, and shows the result', async () => {
    auth.value = student();
    api.myIdentity.mockResolvedValue({ data: { complete: true }, error: null });
    api.joinClass.mockResolvedValue({ data: { ok: true, status: 'joined' }, error: null });
    renderAt();
    const btn = await screen.findByRole('button', { name: 'הצטרפות לכיתה' });
    expect(api.joinClass).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(await screen.findByText(/הצטרפתם לכיתה "כיתה א"/)).toBeTruthy();
    expect(api.joinClass).toHaveBeenCalledWith(TOKEN);
  });

  it('approval mode: explains and reports a pending request', async () => {
    auth.value = student();
    api.previewJoin.mockResolvedValue({ data: { ...ok, requires_approval: true }, error: null });
    api.myIdentity.mockResolvedValue({ data: { complete: true }, error: null });
    api.joinClass.mockResolvedValue({ data: { ok: true, status: 'pending' }, error: null });
    renderAt();
    expect(await screen.findByText(/המורה מאשרת כל הצטרפות/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'שליחת בקשת הצטרפות' }));
    expect(await screen.findByText(/הבקשה נשלחה/)).toBeTruthy();
  });

  it.each([['other_class', /כיתה אחרת באותו מקצוע/], ['blocked', /אי אפשר להצטרף/], ['rejected', /לא אושרה/], ['full', /מספר ההצטרפויות/]])(
    'refusal %s is explained', async (reason, re) => {
      auth.value = student();
      api.myIdentity.mockResolvedValue({ data: { complete: true }, error: null });
      api.joinClass.mockResolvedValue({ data: { ok: false, reason }, error: null });
      renderAt();
      fireEvent.click(await screen.findByRole('button', { name: 'הצטרפות לכיתה' }));
      expect(await screen.findByText(re)).toBeTruthy();
    });

  it('already a member is reported calmly', async () => {
    auth.value = student();
    api.myIdentity.mockResolvedValue({ data: { complete: true }, error: null });
    api.joinClass.mockResolvedValue({ data: { ok: true, status: 'already_member' }, error: null });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'הצטרפות לכיתה' }));
    expect(await screen.findByText(/כבר בכיתה הזו/)).toBeTruthy();
  });
});
