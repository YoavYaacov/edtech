import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../importsApi', async (orig) => ({ ...(await orig()), fetchImports: vi.fn(), archiveImport: vi.fn() }));
import ImportsListPage from '../ImportsListPage';
import * as api from '../importsApi';

beforeEach(() => vi.clearAllMocks());
const mount = () => render(<MemoryRouter><ImportsListPage /></MemoryRouter>);

describe('ImportsListPage', () => {
  it('lists imports with status and counts', async () => {
    api.fetchImports.mockResolvedValue({ data: [{
      id: 'i1', status: 'review', source_name: 'בגרות', created_at: '2026-10-07T10:00:00Z', courses: { title: 'מתמטיקה' },
      import_files: [{ original_name: 'a.pdf', page_count: 12 }],
      import_candidates: [{ review_status: 'pending' }, { review_status: 'pending' }, { review_status: 'approved' }, { review_status: 'rejected' }],
    }], error: null });
    mount();
    expect(await screen.findByText('בגרות')).toBeInTheDocument();
    expect(screen.getByText('מוכן לבדיקה')).toBeInTheDocument();
    expect(screen.getByText('4 הצעות · 2 ממתינות · 1 אושרו')).toBeInTheDocument();
    expect(screen.getByText('12 עמודים')).toBeInTheDocument();
  });
  it('empty state offers a new import', async () => {
    api.fetchImports.mockResolvedValue({ data: [], error: null });
    mount();
    expect(await screen.findByText('עדיין לא ייבאתם שאלות')).toBeInTheDocument();
  });
  it('countCandidates tolerates missing rows', () => {
    expect(api.countCandidates(undefined)).toEqual({ total: 0, pending: 0, approved: 0, rejected: 0 });
  });
});
