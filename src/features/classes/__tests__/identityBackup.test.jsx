import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ identityBackupStatus: vi.fn(), identityBackupExport: vi.fn(), identityBackupImport: vi.fn() }));
vi.mock('../classesApi', () => api);
import IdentityBackupCard from '../IdentityBackupCard';

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.identityBackupStatus.mockResolvedValue({ data: { ok: true, total: 5, readable: 5, last_export_at: null }, error: null });
  URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
});

describe('IdentityBackupCard', () => {
  it('is silent for anyone who is not the owner', async () => {
    api.identityBackupStatus.mockResolvedValue({ data: { ok: false, reason: 'not_available' }, error: null });
    const { container } = render(<IdentityBackupCard />);
    await waitFor(() => expect(api.identityBackupStatus).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows counts only, reminds when no package was exported, and shows no ID digits', async () => {
    const { container } = render(<IdentityBackupCard />);
    expect(await screen.findByText(/5 שמורות מוצפנות/)).toBeTruthy();
    expect(screen.getByText(/מומלץ לייצא חבילת גיבוי/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\d{6,}/);
  });

  it('export downloads the package the server returned (ciphertext) and nothing else', async () => {
    api.identityBackupExport.mockResolvedValue({ data: { ok: true, package: { format: 'hv-identity-v1', mac: 'ab' } }, error: null });
    render(<IdentityBackupCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'ייצוא חבילה מוצפנת' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(JSON.parse(await blob.text())).toEqual({ format: 'hv-identity-v1', mac: 'ab' });
    expect(await screen.findByText(/החבילה ירדה/)).toBeTruthy();
  });

  it('restore: verifies first (no write), shows the counts, writes only after confirmation; a bad signature is refused', async () => {
    api.identityBackupImport.mockResolvedValueOnce({ data: { ok: true, restored: 2, same: 1, no_target: 1, conflict: 0 }, error: null });
    render(<IdentityBackupCard />);
    const input = await screen.findByLabelText('שחזור מחבילה');
    const file = new File([JSON.stringify({ format: 'hv-identity-v1' })], 'p.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/ישוחזרו 2, 1 כבר קיימות, 1 ללא יעד/)).toBeTruthy();
    expect(api.identityBackupImport).toHaveBeenCalledTimes(1);
    expect(api.identityBackupImport.mock.calls[0][1]).toBe(false);
    api.identityBackupImport.mockResolvedValueOnce({ data: { ok: true, restored: 2 }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'שחזור' }));
    await waitFor(() => expect(api.identityBackupImport).toHaveBeenCalledTimes(2));
    expect(api.identityBackupImport.mock.calls[1][1]).toBe(true);
    expect(await screen.findByText('שוחזרו 2 זהויות.')).toBeTruthy();
  });

  it('a package with an invalid signature is refused and nothing is offered for restore', async () => {
    api.identityBackupImport.mockResolvedValue({ data: { ok: false, reason: 'mac' }, error: null });
    render(<IdentityBackupCard />);
    const input = await screen.findByLabelText('שחזור מחבילה');
    fireEvent.change(input, { target: { files: [new File(['{}'], 'p.json')] } });
    expect(await screen.findByText(/החתימה אינה תקפה/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'שחזור' })).toBeNull();
  });
});
