import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../NotificationBell';

// Regression guard for the (already approved) notification model, added with the
// Mobile Notifications QA round. Nothing here depends on layout: the mobile fixes
// were CSS-only, and these tests pin the behaviour those fixes must not change.

const teacherRows = [
  { key: 'a1:s1', kind: 'teacher_pending', assignment_id: 'a1', student_id: 's1', position: 2, pendingCount: 5, correctionCount: 0,
    studentName: 'אבישג וקיל', assignmentTitle: 'בננה', courseTitle: 'יסודות התכנות', unread: true, absorbedEventIds: ['n1'] },
  { key: 'a2:s2', kind: 'teacher_pending', assignment_id: 'a2', student_id: 's2', position: 1, pendingCount: 2, correctionCount: 2,
    studentName: 'נועם ברק', assignmentTitle: 'רקורסיה 1', courseTitle: '', unread: false, absorbedEventIds: [] },
];
const studentRows = [
  { key: 'a1', kind: 'student_returned', assignment_id: 'a1', position: 3, assignmentTitle: 'בננה', courseTitle: '', unread: true, absorbedEventIds: ['n2'] },
  { key: 'fb:a2', kind: 'student_feedback', assignment_id: 'a2', assignmentTitle: 'רקורסיה 1', courseTitle: 'מבוא', unread: true, absorbedEventIds: ['n3', 'n4'] },
];

function setup(props) {
  const onRetry = vi.fn(); const onMarkRead = vi.fn();
  render(
    <MemoryRouter>
      <NotificationBell role="teacher" items={[]} loading={false} error={false} onRetry={onRetry} onMarkRead={onMarkRead} {...props} />
    </MemoryRouter>,
  );
  return { onRetry, onMarkRead, user: userEvent.setup() };
}

describe('NotificationBell — badge', () => {
  it('badge = number of rows in the list; label carries the count', () => {
    setup({ items: teacherRows });
    const btn = screen.getByRole('button', { name: 'התראות, 2 פריטים' });
    expect(within(btn).getByText('2')).toBeInTheDocument();
  });
  it('no badge and a plain label when there is nothing relevant', () => {
    setup({ items: [] });
    const btn = screen.getByRole('button', { name: 'התראות' });
    expect(btn.querySelector('span')).toBeNull();
  });
  it('caps the badge at 99+', () => {
    setup({ items: Array.from({ length: 120 }, (_, i) => ({ ...teacherRows[0], key: `k${i}` })) });
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});

describe('NotificationBell — opening and closing', () => {
  it('opening forces a fresh fetch and shows the panel; X closes it', async () => {
    const { onRetry, user } = setup({ items: teacherRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const panel = screen.getByRole('dialog', { name: 'התראות' });
    await user.click(within(panel).getByRole('button', { name: 'סגירה' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('Escape and a press outside close it', async () => {
    const { user } = setup({ items: teacherRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('empty state', async () => {
    const { user } = setup({ items: [] });
    await user.click(screen.getByRole('button', { name: 'התראות' }));
    expect(screen.getByText('אין כרגע פריטים שדורשים טיפול.')).toBeInTheDocument();
  });
});

describe('NotificationPanel rows — teacher', () => {
  it('Student × Assignment rows with pending / correction wording and deep links', async () => {
    const { user } = setup({ role: 'teacher', items: teacherRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('בננה — אבישג וקיל');
    expect(links[0]).toHaveTextContent('5 שאלות ממתינות לבדיקה · יסודות התכנות');
    expect(links[0]).toHaveAttribute('href', '/teacher/assignments/a1/review?student=s1&q=2');
    expect(links[1]).toHaveTextContent('2 תיקונים לבדיקה');
    expect(links[1]).toHaveAttribute('href', '/teacher/assignments/a2/review?student=s2&q=1');
  });
  it('purple dot only on unread rows; tapping an unread row marks its events read and closes the panel', async () => {
    const { onMarkRead, user } = setup({ role: 'teacher', items: teacherRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    const [first, second] = screen.getAllByRole('link');
    expect(first.querySelector('[class*="unreadDot"]')).not.toBeNull();
    expect(second.querySelector('[class*="unreadDot"]')).toBeNull();
    await user.click(first);
    expect(onMarkRead).toHaveBeenCalledWith(['n1']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('tapping an already-read row does not mark anything read', async () => {
    const { onMarkRead, user } = setup({ role: 'teacher', items: teacherRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    await user.click(screen.getAllByRole('link')[1]);
    expect(onMarkRead).not.toHaveBeenCalled();
  });
});

describe('NotificationPanel rows — student', () => {
  it('"returned" links to the first pending question; "feedback" links to the assignment (no q)', async () => {
    const { user } = setup({ role: 'student', items: studentRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('בננה');
    expect(links[0]).toHaveTextContent('הוחזרה לתיקון');
    expect(links[0]).toHaveAttribute('href', '/student/assignments/a1?q=3');
    expect(links[1]).toHaveTextContent('התקבל משוב חדש · מבוא');
    expect(links[1]).toHaveAttribute('href', '/student/assignments/a2');
  });
  it('a merged feedback row clears every event it absorbed', async () => {
    const { onMarkRead, user } = setup({ role: 'student', items: studentRows });
    await user.click(screen.getByRole('button', { name: /התראות/ }));
    await user.click(screen.getAllByRole('link')[1]);
    expect(onMarkRead).toHaveBeenCalledWith(['n3', 'n4']);
  });
});
