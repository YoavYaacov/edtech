import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listPosts: vi.fn(), createPost: vi.fn(), updatePost: vi.fn(), setPostFlags: vi.fn(), deletePost: vi.fn(),
  listComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(),
}));
vi.mock('../classesApi', () => api);
HTMLDialogElement.prototype.showModal ||= function () { this.open = true; };
HTMLDialogElement.prototype.close ||= function () { this.open = false; };

import ClassBoard from '../ClassBoard';

const post = (over = {}) => ({ id: 'p1', body: 'שלום כיתה', pinned: false, comments_mode: 'off', created_at: '2026-11-10T10:00:00Z', edited_at: null,
  author_name: 'המורה', lesson: null, assignment: null, comment_count: 0, ...over });
const mount = (props) => render(<MemoryRouter><ClassBoard classId="k1" lessonHref={(i) => `/l/${i}`} assignmentHref={(i) => `/a/${i}`} {...props} /></MemoryRouter>);

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listPosts.mockResolvedValue({ data: [post()], error: null });
  api.listComments.mockResolvedValue({ data: [], error: null });
});

describe('ClassBoard - student view', () => {
  it('shows posts but no authoring or moderation controls', async () => {
    mount({});
    expect(await screen.findByText('שלום כיתה')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'הודעה חדשה' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'עריכה' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'מחיקה' })).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('comments off: no comment box, no thread button', async () => {
    mount({});
    await screen.findByText('שלום כיתה');
    expect(screen.queryByRole('button', { name: /הצגת תגובות/ })).toBeNull();
  });

  it('comments open: can write; locked: read only', async () => {
    api.listPosts.mockResolvedValue({ data: [post({ comments_mode: 'open', comment_count: 1 })], error: null });
    api.listComments.mockResolvedValue({ data: [{ id: 'c1', body: 'יפה', author_name: 'נועה ב.', can_delete: false, mine: false }], error: null });
    api.addComment.mockResolvedValue({ data: { ok: true }, error: null });
    mount({});
    fireEvent.click(await screen.findByRole('button', { name: /הצגת תגובות/ }));
    expect(await screen.findByText('נועה ב.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /מחיקת תגובה/ })).toBeNull(); // not mine
    fireEvent.change(screen.getByLabelText('כתבו תגובה'), { target: { value: 'תודה' } });
    fireEvent.click(screen.getByRole('button', { name: 'שליחה' }));
    await waitFor(() => expect(api.addComment).toHaveBeenCalledWith('p1', 'תודה'));
  });

  it('own comment can be deleted; a server refusal is shown', async () => {
    api.listPosts.mockResolvedValue({ data: [post({ comments_mode: 'open', comment_count: 1 })], error: null });
    api.listComments.mockResolvedValue({ data: [{ id: 'c1', body: 'שלי', author_name: 'דנה כ.', can_delete: true, mine: true }], error: null });
    api.deleteComment.mockResolvedValue({ data: null, error: null });
    api.addComment.mockResolvedValue({ data: { ok: false, reason: 'locked' }, error: null });
    mount({});
    fireEvent.click(await screen.findByRole('button', { name: /הצגת תגובות/ }));
    fireEvent.change(await screen.findByLabelText('כתבו תגובה'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'שליחה' }));
    expect(await screen.findByText(/התגובות נעולות בהודעה הזו/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /מחיקת תגובה/ }));
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('c1'));
  });

  it('locked post shows the lock note instead of a form', async () => {
    api.listPosts.mockResolvedValue({ data: [post({ comments_mode: 'locked', comment_count: 2 })], error: null });
    mount({});
    fireEvent.click(await screen.findByRole('button', { name: /הצגת תגובות/ }));
    expect(await screen.findByText(/התגובות בהודעה הזו נעולות/)).toBeTruthy();
    expect(screen.queryByLabelText('כתבו תגובה')).toBeNull();
  });

  it('links to a lesson and an assignment route by role', async () => {
    api.listPosts.mockResolvedValue({ data: [post({ lesson: { id: 'L1', title: 'רקורסיה' }, assignment: { id: 'A1', title: 'תרגיל 1' } })], error: null });
    mount({});
    expect((await screen.findByRole('link', { name: /רקורסיה/ })).getAttribute('href')).toBe('/l/L1');
    expect(screen.getByRole('link', { name: /תרגיל 1/ }).getAttribute('href')).toBe('/a/A1');
  });

  it('empty and error states', async () => {
    api.listPosts.mockResolvedValue({ data: [], error: null });
    mount({});
    expect(await screen.findByText('אין עדיין הודעות.')).toBeTruthy();
  });
});

describe('ClassBoard - teacher view', () => {
  const linkables = { lessons: [{ id: 'L1', title: 'רקורסיה' }], assignments: [{ id: 'A1', title: 'תרגיל 1' }] };

  it('publishes a post with comments off by default and chosen links', async () => {
    api.createPost.mockResolvedValue({ data: { ok: true, id: 'p2' }, error: null });
    mount({ isTeacher: true, linkables });
    fireEvent.click(await screen.findByRole('button', { name: 'הודעה חדשה' }));
    fireEvent.change(screen.getByLabelText('תוכן ההודעה'), { target: { value: 'חדש' } });
    fireEvent.change(screen.getByLabelText(/קישור לשיעורון/), { target: { value: 'L1' } });
    fireEvent.click(screen.getByRole('button', { name: 'פרסום' }));
    await waitFor(() => expect(api.createPost).toHaveBeenCalledWith('k1',
      { body: 'חדש', pinned: false, commentsMode: 'off', lessonId: 'L1', assignmentId: '' }));
  });

  it('server-side link refusal is explained', async () => {
    api.createPost.mockResolvedValue({ data: { ok: false, reason: 'bad_lesson' }, error: null });
    mount({ isTeacher: true, linkables });
    fireEvent.click(await screen.findByRole('button', { name: 'הודעה חדשה' }));
    fireEvent.change(screen.getByLabelText('תוכן ההודעה'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'פרסום' }));
    expect(await screen.findByText(/רק שיעורון של המקצוע הזה/)).toBeTruthy();
  });

  it('pin, lock comments, edit and delete (with confirmation)', async () => {
    api.setPostFlags.mockResolvedValue({ data: null, error: null });
    api.updatePost.mockResolvedValue({ data: { ok: true }, error: null });
    api.deletePost.mockResolvedValue({ data: null, error: null });
    mount({ isTeacher: true, linkables });
    await screen.findByText('שלום כיתה');
    fireEvent.click(screen.getByRole('button', { name: 'הצמדה' }));
    await waitFor(() => expect(api.setPostFlags).toHaveBeenCalledWith('p1', true, 'off'));
    fireEvent.change(screen.getByLabelText('תגובות תלמידים'), { target: { value: 'open' } });
    await waitFor(() => expect(api.setPostFlags).toHaveBeenCalledWith('p1', false, 'open'));
    fireEvent.click(screen.getByRole('button', { name: 'עריכה' }));
    fireEvent.change(screen.getByLabelText('תוכן ההודעה'), { target: { value: 'עודכן' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמירת שינויים' }));
    await waitFor(() => expect(api.updatePost).toHaveBeenCalledWith('p1', expect.objectContaining({ body: 'עודכן' })));
    fireEvent.click(await screen.findByRole('button', { name: 'מחיקה' }));
    expect(api.deletePost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'מחיקת ההודעה' }));
    await waitFor(() => expect(api.deletePost).toHaveBeenCalledWith('p1'));
  });

  it('teacher can delete any comment', async () => {
    api.listPosts.mockResolvedValue({ data: [post({ comments_mode: 'open', comment_count: 1 })], error: null });
    api.listComments.mockResolvedValue({ data: [{ id: 'c9', body: 'לא נעים', author_name: 'דנה כהן', can_delete: true, mine: false }], error: null });
    api.deleteComment.mockResolvedValue({ data: null, error: null });
    mount({ isTeacher: true, linkables });
    fireEvent.click(await screen.findByRole('button', { name: /הצגת תגובות/ }));
    fireEvent.click(await screen.findByRole('button', { name: /מחיקת תגובה/ }));
    await waitFor(() => expect(api.deleteComment).toHaveBeenCalledWith('c9'));
  });
});
