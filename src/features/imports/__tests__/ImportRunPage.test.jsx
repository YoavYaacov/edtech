import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const driver = { phase: 'idle', waitMs: 0, error: null, lastWarning: null, start: vi.fn(), pause: vi.fn() };
vi.mock('../useImportDriver', () => ({ useImportDriver: () => driver }));
vi.mock('../importsApi', () => ({
  fetchImport: vi.fn(), fetchChunks: vi.fn(), fetchCandidatesSummary: vi.fn(), fetchSameFileImports: vi.fn(),
  archiveImport: vi.fn(async () => ({ error: null })), retryFailedChunks: vi.fn(async () => ({ data: { ok: true, chunks_reset: 1 }, error: null })),
}));
import ImportRunPage from '../ImportRunPage';
import * as api from '../importsApi';

const file = { id: 'f', original_name: 'geo.pdf', page_count: 9, size_bytes: 10, sha256: 'a'.repeat(64) };
const imp = (o = {}) => ({ id: 'i1', status: 'processing', source_name: 'בגרות גיאומטריה', courses: { title: 'מתמטיקה' }, import_files: [file], archived_at: null, ...o });
const ch = (o) => ({ id: Math.random().toString(), seq: 1, page_from: 1, page_to: 3, kind: 'standard', status: 'pending', attempts: 0, warnings: [], candidates_count: 0, ...o });
const mount = () => render(
  <MemoryRouter initialEntries={['/teacher/questions/import/i1']}>
    <Routes>
      <Route path="/teacher/questions/import/:importId" element={<ImportRunPage />} />
      <Route path="/teacher/questions/import" element={<div>LIST</div>} />
    </Routes>
  </MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks(); driver.phase = 'idle';
  api.fetchImport.mockResolvedValue({ data: imp(), error: null });
  api.fetchChunks.mockResolvedValue({ data: [ch({ page_from: 1, page_to: 3 }), ch({ seq: 2, page_from: 4, page_to: 6 })], error: null });
  api.fetchCandidatesSummary.mockResolvedValue({ data: [], error: null });
  api.fetchSameFileImports.mockResolvedValue({ data: [], error: null });
});

describe('ImportRunPage', () => {
  it('a processing import with untouched chunks starts the driver by itself', async () => {
    mount();
    await waitFor(() => expect(driver.start).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('העיבוד רץ רק כל עוד המסך הזה פתוח. אם תסגרו אותו, אפשר להמשיך בכל רגע מהרשימה.')).toBeInTheDocument();
  });

  it('a file imported before is NOT processed until the teacher decides', async () => {
    api.fetchSameFileImports.mockResolvedValue({ data: [{ importId: 'old', name: 'ישן' }], error: null });
    const user = userEvent.setup(); mount();
    expect(await screen.findByText('הקובץ הזה כבר יובא')).toBeInTheDocument();
    expect(driver.start).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'להמשיך בכל זאת' }));
    expect(driver.start).toHaveBeenCalledTimes(1);
  });

  it('cancelling a duplicate archives the import and goes back to the list', async () => {
    api.fetchSameFileImports.mockResolvedValue({ data: [{ importId: 'old', name: 'ישן' }], error: null });
    const user = userEvent.setup(); mount();
    await user.click(await screen.findByRole('button', { name: 'לבטל את הייבוא הזה' }));
    await screen.findByText('LIST');
    expect(api.archiveImport).toHaveBeenCalledWith('i1');
    expect(driver.start).not.toHaveBeenCalled();
  });

  it('an import already in review does not call the AI again and lists the proposals read-only', async () => {
    api.fetchImport.mockResolvedValue({ data: imp({ status: 'review' }), error: null });
    api.fetchChunks.mockResolvedValue({ data: [ch({ status: 'done', page_from: 1, page_to: 9 })], error: null });
    api.fetchCandidatesSummary.mockResolvedValue({ data: [
      { id: 'c1', ordinal: 1, source_pages: [2], source_label: 'שאלה 1', review_status: 'pending', flags: [{ kind: 'figure_dependent', severity: 'material', message: '' }], draft: { title: 'משולש ישר זווית' } },
    ], error: null });
    mount();
    expect(await screen.findByText('משולש ישר זווית')).toBeInTheDocument();
    expect(screen.getByText('תלויה בשרטוט')).toBeInTheDocument();
    expect(screen.getByText('העיבוד הסתיים. ההצעות מוכנות לבדיקה.')).toBeInTheDocument();
    expect(driver.start).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /אישור|אשר/ })).not.toBeInTheDocument(); // no approve here: that is R1B-2
  });

  it('failed chunks and possible-missing-questions are surfaced; retry resets then restarts', async () => {
    api.fetchChunks.mockResolvedValue({ data: [
      ch({ status: 'done', page_from: 1, page_to: 3, warnings: [{ kind: 'possible_missing_questions' }] }),
      ch({ seq: 2, status: 'failed', page_from: 4, page_to: 6 }),
      ch({ seq: 3, status: 'pending', page_from: 7, page_to: 9, attempts: 1 }),
    ], error: null });
    const user = userEvent.setup(); mount();
    expect(await screen.findByText('לא הצלחנו לעבד: 4–6. אפשר לנסות שוב.')).toBeInTheDocument();
    expect(screen.getByText('בעמודים 1–3 המערכת חשדה שלא כל השאלות זוהו. כדאי לבדוק מול הקובץ.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ניסיון חוזר לקטעים שנכשלו' }));
    await waitFor(() => expect(api.retryFailedChunks).toHaveBeenCalledWith('i1'));
    await waitFor(() => expect(driver.start).toHaveBeenCalled());
  });

  it('shows the daily-budget message when the driver stops on budget', async () => {
    driver.phase = 'budget';
    mount();
    expect(await screen.findByText(/מכסת העיבוד היומית/)).toBeInTheDocument();
  });
});
