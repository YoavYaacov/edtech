import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const api = vi.hoisted(() => ({ rosterForJoin: vi.fn(), verifyRosterEntry: vi.fn(), claimRoster: vi.fn(),
  bindTicketEmail: vi.fn(), completePendingJoin: vi.fn(), joinStatus: vi.fn() }));
const auth = vi.hoisted(() => ({ value: {} }));
vi.mock('../classesApi', () => api);
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => auth.value }));

import JoinPage from '../JoinPage';

const TOKEN = 'a'.repeat(32);
const renderAt = (token = TOKEN) => render(
  <MemoryRouter initialEntries={[`/join/${token}`]}><Routes><Route path="/join/:token" element={<JoinPage />} /><Route path="/student" element={<div>HOME</div>} /></Routes></MemoryRouter>,
);
const list = { status: 'ok', class_title: 'כיתה א', course_title: 'מתמטיקה', students: [{ id: 'r1', name: 'דנה כהן' }, { id: 'r2', name: 'נועה בר' }] };
const signedOut = () => ({ session: null, profile: null, isInitializing: false, signIn: vi.fn().mockResolvedValue({ error: null }),
  signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }), signOut: vi.fn() });
const student = () => ({ session: { user: { id: 's1' } }, profile: { role: 'student' }, isInitializing: false, signOut: vi.fn() });
const pick = (name, id) => {
  fireEvent.change(screen.getByLabelText('השם שלי'), { target: { value: name } });
  fireEvent.change(screen.getByLabelText('מספר תעודת זהות'), { target: { value: id } });
};

beforeEach(() => {
  window.sessionStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  api.rosterForJoin.mockResolvedValue({ data: list, error: null });
  api.bindTicketEmail.mockResolvedValue({ data: { ok: true }, error: null });
  api.completePendingJoin.mockResolvedValue({ data: { ok: false, reason: 'none' }, error: null });
  api.joinStatus.mockResolvedValue({ data: { member: false }, error: null });
  auth.value = signedOut();
});

describe('JoinPage (roster flow)', () => {
  it('confirmation link opened on another device: the server finishes the pending join and the student lands on home', async () => {
    auth.value = student();
    api.completePendingJoin.mockResolvedValue({ data: { ok: true, status: 'joined', class_id: 'k1' }, error: null });
    renderAt();
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(api.verifyRosterEntry).not.toHaveBeenCalled(); // no second name / ID step
    expect(screen.queryByLabelText('השם שלי')).toBeNull();
  });

  it('opening the link again as an existing member goes home without duplicates or questions', async () => {
    auth.value = student();
    api.joinStatus.mockResolvedValue({ data: { member: true }, error: null });
    renderAt();
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(api.claimRoster).not.toHaveBeenCalled();
  });

  it('existing member sees home even when the link has expired since', async () => {
    auth.value = student();
    api.rosterForJoin.mockResolvedValue({ data: { status: 'expired' }, error: null });
    api.joinStatus.mockResolvedValue({ data: { member: true }, error: null });
    renderAt();
    expect(await screen.findByText('HOME')).toBeTruthy();
  });

  it('a signed-in account that never joined (created before the fix) verifies name + ID once and joins', async () => {
    auth.value = student();
    api.verifyRosterEntry.mockResolvedValue({ data: { ok: true, ticket: 'T'.repeat(48), name: 'דנה' }, error: null });
    api.claimRoster.mockResolvedValue({ data: { ok: true, status: 'joined' }, error: null });
    renderAt();
    await screen.findByLabelText('השם שלי');
    pick('r1', '936044502');
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    expect(await screen.findByText('HOME')).toBeTruthy();
  });

  it('a pending join that cannot complete for a real reason (other class) is explained, not hidden', async () => {
    auth.value = student();
    api.completePendingJoin.mockResolvedValue({ data: { ok: false, reason: 'other_class' }, error: null });
    renderAt();
    expect(await screen.findByText(/כיתה אחרת באותו מקצוע/)).toBeTruthy();
  });

  it('malformed token never reaches the server', async () => {
    renderAt('short');
    expect(await screen.findByText(/הקישור אינו תקף/)).toBeTruthy();
    expect(api.rosterForJoin).not.toHaveBeenCalled();
  });

  it.each([['expired', /תוקף הקישור פג/], ['revoked', /בוטל על ידי המורה/], ['full', /מספר ההצטרפויות המרבי/], ['invalid', /הקישור אינו תקף/]])(
    'shows the %s state and nothing else', async (status, re) => {
      api.rosterForJoin.mockResolvedValue({ data: { status }, error: null });
      renderAt();
      expect(await screen.findByText(re)).toBeTruthy();
      expect(screen.queryByLabelText('השם שלי')).toBeNull();
    });

  it('first step is the name list and the ID, with no account form yet', async () => {
    renderAt();
    expect(await screen.findByText(/כיתה א/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'דנה כהן' })).toBeTruthy();
    expect(screen.queryByLabelText('אימייל')).toBeNull();
    expect(screen.queryByLabelText('סיסמה')).toBeNull();
  });

  it('empty list explains to contact the teacher', async () => {
    api.rosterForJoin.mockResolvedValue({ data: { ...list, students: [] }, error: null });
    renderAt();
    expect(await screen.findByText(/אין כרגע שמות ברשימה/)).toBeTruthy();
  });

  it('checks the ID format locally and shows a generic message on a wrong match', async () => {
    renderAt();
    await screen.findByLabelText('השם שלי');
    pick('r1', '936044503');
    expect(screen.getByText(/מספר תעודת הזהות אינו תקין/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'המשך' }).disabled).toBe(true);
    pick('r1', '442852497');
    api.verifyRosterEntry.mockResolvedValue({ data: { ok: false, reason: 'wrong' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    expect(await screen.findByText(/השם ומספר הזהות אינם תואמים/)).toBeTruthy();
    expect(api.verifyRosterEntry).toHaveBeenCalledWith(TOKEN, 'r1', '442852497');
  });

  it('after verification a signed-out student creates an account (register is the default tab, no extra checkbox)', async () => {
    renderAt();
    await screen.findByLabelText('השם שלי');
    pick('r1', '936044502');
    api.verifyRosterEntry.mockResolvedValue({ data: { ok: true, ticket: 'T'.repeat(48), name: 'דנה כהן' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    expect(await screen.findByLabelText('אימייל')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('tab', { name: 'חשבון חדש' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'longenough1' } });
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת חשבון' }));
    await waitFor(() => expect(auth.value.signUp).toHaveBeenCalledWith('a@b.co', 'longenough1', expect.stringContaining('/join/')));
    expect(api.bindTicketEmail).toHaveBeenCalledWith('T'.repeat(48), 'a@b.co');
    expect(api.bindTicketEmail.mock.invocationCallOrder[0]).toBeLessThan(auth.value.signUp.mock.invocationCallOrder[0]);
    expect(await screen.findByText(/שלחנו אימייל/)).toBeTruthy();
  });

  it('a signed-in student with a verified ticket joins automatically', async () => {
    auth.value = student();
    api.verifyRosterEntry.mockResolvedValue({ data: { ok: true, ticket: 'T'.repeat(48), name: 'דנה כהן' }, error: null });
    api.claimRoster.mockResolvedValue({ data: { ok: true, status: 'joined', class_id: 'k1' }, error: null });
    renderAt();
    await screen.findByLabelText('השם שלי');
    expect(api.claimRoster).not.toHaveBeenCalled();
    pick('r1', '936044502');
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(api.claimRoster).toHaveBeenCalledTimes(1);
    expect(api.claimRoster).toHaveBeenCalledWith('T'.repeat(48));
  });

  it('a student who registers (session appears) with a stored ticket joins without asking again', async () => {
    window.sessionStorage.setItem(`hevanti:ticket:${TOKEN}`, 'K'.repeat(48));
    auth.value = student();
    api.claimRoster.mockResolvedValue({ data: { ok: true, status: 'already_member' }, error: null });
    renderAt();
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(api.claimRoster).toHaveBeenCalledWith('K'.repeat(48));
  });

  it.each([['id_in_use', /כבר יש חשבון עם תעודת הזהות/], ['taken', /כבר נרשם בחשבון אחר/], ['other_class', /כיתה אחרת באותו מקצוע/], ['blocked', /אי אפשר להצטרף/], ['full', /מספר ההצטרפויות/]])(
    'claim refusal %s is explained', async (reason, re) => {
      window.sessionStorage.setItem(`hevanti:ticket:${TOKEN}`, 'K'.repeat(48));
      auth.value = student();
      api.claimRoster.mockResolvedValue({ data: { ok: false, reason }, error: null });
      renderAt();
      expect(await screen.findByText(re)).toBeTruthy();
    });

  it('an expired ticket sends the student back to the name step', async () => {
    window.sessionStorage.setItem(`hevanti:ticket:${TOKEN}`, 'K'.repeat(48));
    auth.value = student();
    api.claimRoster.mockResolvedValue({ data: { ok: false, reason: 'ticket_invalid' }, error: null });
    renderAt();
    fireEvent.click(await screen.findByRole('button', { name: 'חזרה לבחירת השם' }));
    expect(await screen.findByLabelText('השם שלי')).toBeTruthy();
  });

  it('teacher account cannot join', async () => {
    auth.value = { ...student(), profile: { role: 'teacher' } };
    renderAt();
    expect(await screen.findByText(/מחוברים כמורים/)).toBeTruthy();
    expect(api.claimRoster).not.toHaveBeenCalled();
  });
});

describe('JoinPage (link opened twice / other device / existing ID)', () => {
  it('a used confirmation link (error in the URL) explains and offers login only, without asking for name + ID', async () => {
    window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    renderAt();
    expect(await screen.findByText(/הקישור כבר נוצל/)).toBeTruthy();
    expect(screen.queryByLabelText('השם שלי')).toBeNull();
    expect(screen.getByLabelText('אימייל')).toBeTruthy();
    window.location.hash = '';
  });

  it('after registering, the waiting screen lets the student continue once the e-mail was confirmed elsewhere', async () => {
    api.verifyRosterEntry.mockResolvedValue({ data: { ok: true, ticket: 'T'.repeat(48), name: 'דנה' }, error: null });
    renderAt();
    await screen.findByLabelText('השם שלי');
    pick('r1', '936044502');
    fireEvent.click(screen.getByRole('button', { name: 'המשך' }));
    fireEvent.change(await screen.findByLabelText('אימייל'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('סיסמה'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת חשבון' }));
    fireEvent.click(await screen.findByRole('button', { name: 'אימתתי, להמשיך' }));
    await waitFor(() => expect(auth.value.signIn).toHaveBeenCalledWith('a@b.co', 'password123'));
  });

  it('an ID that already belongs to an account points to logging into it', async () => {
    auth.value = student();
    api.completePendingJoin.mockResolvedValue({ data: { ok: false, reason: 'id_in_use' }, error: null });
    renderAt();
    expect(await screen.findByText(/כבר יש חשבון עם תעודת הזהות/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'כניסה לחשבון הקיים' }));
    expect(auth.value.signOut).toHaveBeenCalled();
  });
});

describe('JoinPage (profile refresh)', () => {
  it('reloads the profile after joining, so the name saved by the join shows on the home screen', async () => {
    const reloadProfile = vi.fn().mockResolvedValue(undefined);
    auth.value = { ...student(), reloadProfile };
    api.completePendingJoin.mockResolvedValue({ data: { ok: true, status: 'joined', class_id: 'k1' }, error: null });
    renderAt();
    expect(await screen.findByText('HOME')).toBeTruthy();
    expect(reloadProfile).toHaveBeenCalled();
  });
});
