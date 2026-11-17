import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ rosterList: vi.fn(), rosterAdd: vi.fn(), rosterRemove: vi.fn() }));
vi.mock('../classesApi', () => api);
import RosterPanel from '../RosterPanel';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.rosterList.mockResolvedValue({ data: [
    { id: 'r1', first_name: 'דנה', last_name: 'כהן', id_masked: '••••••502', claimed: false },
    { id: 'r2', first_name: 'נועה', last_name: 'בר', id_masked: '••••••497', claimed: true }], error: null });
});

describe('RosterPanel', () => {
  it('lists students with masked IDs; only unclaimed entries can be removed here', async () => {
    api.rosterRemove.mockResolvedValue({ data: { ok: true }, error: null });
    render(<RosterPanel classId="k1" />);
    expect(await screen.findByText(/דנה כהן/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('936044502');
    expect(screen.queryByRole('button', { name: /הסרה מהרשימה: נועה בר/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /הסרה מהרשימה: דנה כהן/ }));
    await waitFor(() => expect(api.rosterRemove).toHaveBeenCalledWith('r1'));
  });

  it('sends only valid lines, reports problems by line, and keeps failed lines in the box', async () => {
    api.rosterAdd.mockResolvedValue({ data: { added: 1, errors: [{ row: 2, reason: 'duplicate' }] }, error: null });
    render(<RosterPanel classId="k1" />);
    await screen.findByText(/דנה כהן/);
    fireEvent.change(screen.getByLabelText('רשימת תלמידים בכיתה'), { target: { value: 'אורי, לוי, 975142126\nדנה, כהן, 936044502\nשגוי, שורה, 123' } });
    fireEvent.click(screen.getByRole('button', { name: 'הוספה לרשימה' }));
    await waitFor(() => expect(api.rosterAdd).toHaveBeenCalledWith('k1', [
      { first: 'אורי', last: 'לוי', id: '975142126' }, { first: 'דנה', last: 'כהן', id: '936044502' }]));
    expect(await screen.findByText('נוסף תלמיד אחד.')).toBeTruthy();
    expect(screen.getByText(/שורה 2: כבר ברשימה/)).toBeTruthy();
    expect(screen.getByText(/שורה 3: תעודת זהות לא תקינה/)).toBeTruthy();
    expect(screen.getByLabelText('רשימת תלמידים בכיתה').value).toBe('דנה, כהן, 936044502\nשגוי, שורה, 123');
  });
});
