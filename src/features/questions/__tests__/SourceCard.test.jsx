import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../imports/importsApi', () => ({ fetchProvenance: vi.fn() }));
import SourceCard from '../SourceCard';
import { fetchProvenance } from '../../imports/importsApi';

const prov = { question_id: 'q', import_id: 'i1', file_name: 'geo.pdf', source_pages: [4, 5], source_label: '7', source_text: 'טקסט מקור', extraction_kind: 'multimodal_pdf',
  flags: [{ kind: 'figure_dependent', severity: 'material' }], model: 'gemini-3.5-flash-lite', prompt_version: 'import-b-v1', teacher_edited: true, approved_at: '2026-10-07T10:00:00Z' };
const mount = () => render(<MemoryRouter><SourceCard questionId="q" /></MemoryRouter>);

describe('SourceCard', () => {
  it('shows file, pages, model, edited flag and warnings for an imported question', async () => {
    fetchProvenance.mockResolvedValue({ data: prov, error: null });
    mount();
    expect(await screen.findByText('מקור השאלה')).toBeInTheDocument();
    expect(screen.getByText('קובץ: geo.pdf')).toBeInTheDocument();
    expect(screen.getByText(/עמודים 4–5/)).toBeInTheDocument();
    expect(screen.getByText('נערכה על ידך לפני האישור')).toBeInTheDocument();
    expect(screen.getByText('תלויה בשרטוט')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'פתיחת הייבוא' })).toHaveAttribute('href', '/teacher/questions/import/i1');
  });
  it('renders nothing for a question that was not imported, and nothing on error', async () => {
    fetchProvenance.mockResolvedValue({ data: null, error: null });
    const { container } = mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
    fetchProvenance.mockResolvedValue({ data: null, error: { message: 'x' } });
    const again = mount();
    await new Promise((r) => setTimeout(r, 30));
    expect(again.container).toBeEmptyDOMElement();
  });
});
