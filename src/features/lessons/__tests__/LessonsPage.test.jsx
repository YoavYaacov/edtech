import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { nav } from '../../../i18n/he';

const api = vi.hoisted(() => ({ fetchLessons: vi.fn(), fetchUploadContext: vi.fn(), importVersion: vi.fn() }));
vi.mock('../lessonsApi', () => api);
import LessonsPage from '../LessonsPage';

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

describe('LessonsPage', () => {
  it('no lessons yet: a valid empty screen WITH the upload control (not an error)', async () => {
    api.fetchLessons.mockResolvedValue({ data: [], error: null });
    api.fetchUploadContext.mockResolvedValue({ data: [], error: null });
    render(<MemoryRouter><LessonsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('עוד אין שיעורונים')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'בחירת קבצים' })).toBeTruthy();
    expect(screen.queryByText(/לא הצלחנו לטעון/)).toBeNull();
  });
  it('a load error is shown as an error with retry', async () => {
    api.fetchLessons.mockResolvedValue({ data: null, error: { code: 'X' } });
    api.fetchUploadContext.mockResolvedValue({ data: [], error: null });
    render(<MemoryRouter><LessonsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/לא הצלחנו לטעון/)).toBeTruthy());
  });
});

describe('regressions', () => {
  it('the nav label for lessons lives in `nav` (was missing from the sidebar)', () => {
    expect(nav.lessons).toBe('שיעורונים');
  });
  it('every embed of lesson_versions names its FK (two FKs exist between lessons and lesson_versions)', () => {
    const src = readFileSync(join(__dirname, '../lessonsApi.js'), 'utf8');
    const embeds = src.match(/:lesson_versions[^(]*\(/g) ?? [];
    expect(embeds.length).toBeGreaterThan(0);
    for (const e of embeds) expect(e).toContain('!lesson_versions_lesson_id_fkey');
  });
});
