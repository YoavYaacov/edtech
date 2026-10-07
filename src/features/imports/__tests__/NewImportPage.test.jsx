import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../importsApi', () => ({
  createImport: vi.fn(), uploadSource: vi.fn(), finalizeUpload: vi.fn(), sourcePath: (u, i) => `${u}/${i}/source.pdf`,
}));
vi.mock('../../content/contentApi', () => ({ fetchCourses: vi.fn(async () => ({ data: [{ id: 'c1', title: 'מבני נתונים', is_archived: false }], error: null })) }));
vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

import NewImportPage from '../NewImportPage';
import * as api from '../importsApi';

const good = { pageCount: 6, pageStats: Array.from({ length: 6 }, () => ({ chars: 900, images: 0 })) };
const pdf = () => new File(['%PDF-1.4 x'], 'geo.pdf', { type: 'application/pdf' });
function setup(props = {}) {
  render(
    <MemoryRouter initialEntries={['/teacher/questions/import/new']}>
      <Routes>
        <Route path="/teacher/questions/import/new" element={<NewImportPage analyze={vi.fn(async () => good)} hash={vi.fn(async () => 'a'.repeat(64))} {...props} />} />
        <Route path="/teacher/questions/import/:importId" element={<div>RUN PAGE</div>} />
        <Route path="/teacher/questions/import" element={<div>LIST</div>} />
      </Routes>
    </MemoryRouter>);
}
async function fill(user, { consent = true, file = pdf() } = {}) {
  await screen.findByLabelText('קורס');
  await user.selectOptions(screen.getByLabelText('קורס'), 'c1');
  await user.upload(screen.getByLabelText('קובץ PDF'), file);
  await screen.findByText(/geo\.pdf/);
  if (consent) await user.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.createImport.mockResolvedValue({ data: { ok: true, import_id: 'imp1', created: true }, error: null });
  api.uploadSource.mockResolvedValue({ ok: true, existed: false });
  api.finalizeUpload.mockResolvedValue({ data: { ok: true, file_id: 'f', chunks: 2, duplicate_file_import_id: null }, error: null });
});

describe('NewImportPage', () => {
  it('runs create -> upload -> finalize in that order, with consent, then opens the import', async () => {
    const user = userEvent.setup(); setup(); await fill(user);
    await user.click(screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' }));
    await screen.findByText('RUN PAGE');
    expect(api.createImport).toHaveBeenCalledTimes(1);
    expect(api.createImport.mock.calls[0][0]).toMatchObject({ courseId: 'c1', sourceType: 'original', sourceYear: null });
    expect(api.uploadSource.mock.calls[0][0]).toBe('u1/imp1/source.pdf');
    const fin = api.finalizeUpload.mock.calls[0][0];
    expect(fin).toMatchObject({ importId: 'imp1', storagePath: 'u1/imp1/source.pdf', originalName: 'geo.pdf', pageCount: 6, consent: true, sha256: 'a'.repeat(64) });
    expect(fin.pageStats).toHaveLength(6);
  });

  it('without consent nothing is created, uploaded or sent', async () => {
    const user = userEvent.setup(); setup(); await fill(user, { consent: false });
    await user.click(screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' }));
    expect(await screen.findByText('כדי להמשיך צריך לאשר את שליחת הקובץ.')).toBeInTheDocument();
    expect(api.createImport).not.toHaveBeenCalled();
    expect(api.uploadSource).not.toHaveBeenCalled();
  });

  it('a scanned / too-long / unreadable PDF is stopped in the browser, before any server call', async () => {
    for (const [mock, text] of [
      [async () => ({ pageCount: 4, pageStats: Array.from({ length: 4 }, () => ({ chars: 3, images: 1 })) }), /PDF סרוק/],
      [async () => ({ pageCount: 31, pageStats: Array.from({ length: 31 }, () => ({ chars: 900, images: 0 })) }), /יותר מ-30 עמודים/],
      [async () => { throw new Error('encrypted'); }, /לא הצלחנו לקרוא/],
    ]) {
      const user = userEvent.setup(); setup({ analyze: vi.fn(mock) });
      await screen.findByLabelText('קורס');
      await user.upload(screen.getByLabelText('קובץ PDF'), pdf());
      expect(await screen.findByText(text)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' }));
      expect(api.createImport).not.toHaveBeenCalled();
      document.body.innerHTML = '';
    }
  });

  it('shows the server reason when finalize refuses, and does not navigate', async () => {
    api.finalizeUpload.mockResolvedValue({ data: { ok: false, reason: 'scanned_pdf' }, error: null });
    const user = userEvent.setup(); setup(); await fill(user);
    await user.click(screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' }));
    expect(await screen.findByText(/PDF סרוק/)).toBeInTheDocument();
    expect(screen.queryByText('RUN PAGE')).not.toBeInTheDocument();
  });

  it('an upload failure stops before finalize', async () => {
    api.uploadSource.mockResolvedValue({ ok: false, error: new Error('x') });
    const user = userEvent.setup(); setup(); await fill(user);
    await user.click(screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' }));
    expect(await screen.findByText('העלאת הקובץ נכשלה. בדקו את החיבור ונסו שוב.')).toBeInTheDocument();
    expect(api.finalizeUpload).not.toHaveBeenCalled();
  });

  it('retrying the same file reuses the same client_request_id (idempotent create)', async () => {
    api.uploadSource.mockResolvedValueOnce({ ok: false, error: new Error('x') });
    const user = userEvent.setup(); setup(); await fill(user);
    const btn = () => screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' });
    await user.click(btn());
    await screen.findByText('העלאת הקובץ נכשלה. בדקו את החיבור ונסו שוב.');
    await user.click(btn());
    await waitFor(() => expect(api.createImport).toHaveBeenCalledTimes(2));
    expect(api.createImport.mock.calls[1][0].clientRequestId).toBe(api.createImport.mock.calls[0][0].clientRequestId);
  });

  it('already_uploaded on finalize just opens the existing import', async () => {
    api.finalizeUpload.mockResolvedValue({ data: { ok: false, reason: 'already_uploaded' }, error: null });
    const user = userEvent.setup(); setup(); await fill(user);
    await user.click(screen.getByRole('button', { name: 'העלאה והתחלת עיבוד' }));
    await screen.findByText('RUN PAGE');
  });
});
