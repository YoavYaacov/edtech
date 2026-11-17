import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../AuthProvider', () => ({ useAuth: () => auth.value, homePathFor: (r) => (r === 'teacher' ? '/teacher' : '/student') }));
import FreshOpenRedirect from '../FreshOpenRedirect';
import { resetFreshOpenForTests } from '../freshOpen';

const Where = () => <span data-testid="p">{useLocation().pathname}</span>;
const mount = (path) => render(
  <MemoryRouter initialEntries={[path]}><FreshOpenRedirect /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>);
beforeEach(() => {
  window.sessionStorage.clear(); resetFreshOpenForTests();
  auth.value = { session: {}, profile: { role: 'teacher' }, isInitializing: false };
});

describe('FreshOpenRedirect', () => {
  it('fresh open on a restored screen => role dashboard', async () => {
    const { getByTestId } = mount('/teacher/questions');
    await waitFor(() => expect(getByTestId('p').textContent).toBe('/teacher'));
  });
  it('same tab reloaded (flag set) => stays where it was', async () => {
    window.sessionStorage.setItem('hevanti:booted', '1');
    const { getByTestId } = mount('/teacher/questions');
    await new Promise((r) => setTimeout(r, 30));
    expect(getByTestId('p').textContent).toBe('/teacher/questions');
  });
  it('signed out => no redirect (login flow owns it)', async () => {
    auth.value = { session: null, profile: null, isInitializing: false };
    const { getByTestId } = mount('/teacher/questions');
    await new Promise((r) => setTimeout(r, 30));
    expect(getByTestId('p').textContent).toBe('/teacher/questions');
  });
  it('acts once: later in-app navigation is never redirected', async () => {
    const { getByTestId, getByText } = render(
      <MemoryRouter initialEntries={['/teacher/questions']}><FreshOpenRedirect />
        <Link to="/teacher/lessons">go</Link><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(getByTestId('p').textContent).toBe('/teacher'));
    fireEvent.click(getByText('go'));
    await new Promise((r) => setTimeout(r, 30));
    expect(getByTestId('p').textContent).toBe('/teacher/lessons');
  });
});
