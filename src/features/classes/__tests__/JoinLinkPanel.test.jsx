import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  fetchActiveJoinLink: vi.fn(), createJoinLink: vi.fn(), revokeJoinLink: vi.fn(), setJoinApproval: vi.fn(),
  listJoinRequests: vi.fn(), decideJoinRequest: vi.fn(), joinUrl: (t) => `https://app.test/join/${t}`,
}));
vi.mock('../classesApi', () => api);
const copy = vi.hoisted(() => ({ copyText: vi.fn().mockResolvedValue(true) }));
vi.mock('../../content/topicsExport', () => copy);

import JoinLinkPanel from '../JoinLinkPanel';

const future = new Date(Date.now() + 5 * 864e5).toISOString();
const link = { id: 'l1', class_id: 'k1', token: 'T'.repeat(32), expires_at: future, max_uses: 30, uses: 4, revoked_at: null };
const mount = (props = {}) => render(<MemoryRouter><JoinLinkPanel classId="k1" requiresApproval={false} onChanged={vi.fn()} {...props} /></MemoryRouter>);

beforeEach(() => {
  Object.values(api).forEach((f) => typeof f?.mockReset === 'function' && f.mockReset());
  copy.copyText.mockClear();
  api.fetchActiveJoinLink.mockResolvedValue({ data: link, error: null });
  api.listJoinRequests.mockResolvedValue({ data: [], error: null });
  for (const k of ['createJoinLink', 'revokeJoinLink', 'setJoinApproval', 'decideJoinRequest']) api[k].mockResolvedValue({ data: {}, error: null });
});

describe('JoinLinkPanel', () => {
  it('shows the link, expiry and usage; copy sends the full URL', async () => {
    mount();
    const input = await screen.findByDisplayValue(`https://app.test/join/${link.token}`);
    expect(input.readOnly).toBe(true);
    expect(document.body.textContent).toContain('4 מתוך 30 הצטרפויות');
    fireEvent.click(screen.getByRole('button', { name: 'העתקת הקישור' }));
    await waitFor(() => expect(copy.copyText).toHaveBeenCalledWith(`https://app.test/join/${link.token}`));
  });

  it('with no link: offers creation with expiry/limit, validated', async () => {
    api.fetchActiveJoinLink.mockResolvedValue({ data: null, error: null });
    mount();
    expect(await screen.findByText(/אין קישור פעיל/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/תוקף \(ימים\)/), { target: { value: '120' } });
    expect(screen.getByRole('button', { name: 'יצירת קישור' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/תוקף \(ימים\)/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/מספר הצטרפויות מרבי/), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'יצירת קישור' }));
    await waitFor(() => expect(api.createJoinLink).toHaveBeenCalledWith('k1', 7, 25));
  });

  it('renew and revoke call the server', async () => {
    mount();
    await screen.findByDisplayValue(/join/);
    fireEvent.click(screen.getByRole('button', { name: 'חידוש הקישור' }));
    await waitFor(() => expect(api.createJoinLink).toHaveBeenCalledWith('k1', 14, null));
    fireEvent.click(screen.getByRole('button', { name: 'ביטול הקישור' }));
    await waitFor(() => expect(api.revokeJoinLink).toHaveBeenCalledWith('k1'));
  });

  it('approval toggle and pending requests', async () => {
    api.listJoinRequests.mockResolvedValue({ data: [{ id: 'r1', name: 'דנה כהן', created_at: future }], error: null });
    const onChanged = vi.fn();
    mount({ requiresApproval: true, onChanged });
    expect(await screen.findByText('דנה כהן')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /אישור: דנה כהן/ }));
    await waitFor(() => expect(api.decideJoinRequest).toHaveBeenCalledWith('r1', true));
    fireEvent.click(screen.getByRole('button', { name: /דחייה: דנה כהן/ }));
    await waitFor(() => expect(api.decideJoinRequest).toHaveBeenCalledWith('r1', false));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(api.setJoinApproval).toHaveBeenCalledWith('k1', false));
  });

  it('an expired link cannot be copied', async () => {
    api.fetchActiveJoinLink.mockResolvedValue({ data: { ...link, expires_at: new Date(Date.now() - 1000).toISOString() }, error: null });
    mount();
    await screen.findByDisplayValue(/join/);
    expect(screen.getByRole('button', { name: 'העתקת הקישור' }).disabled).toBe(true);
  });
});
