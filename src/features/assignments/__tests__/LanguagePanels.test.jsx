import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BlockersPanel } from '../LanguagePanels';

const status = (items) => ({ language: 'csharp', status: 'draft', items, recipients: [] });

describe('BlockersPanel', () => {
  it('shows the missing-variant blocker with a manual-create link and a disabled AI placeholder', () => {
    render(<MemoryRouter><BlockersPanel status={status([
      { assignment_question_id: 'a1', question_id: 'q1', title: 'לולאות', status: 'missing_variant' },
      { assignment_question_id: 'a2', question_id: 'q2', title: 'מערכים', status: 'ok' },
    ])} /></MemoryRouter>);
    expect(screen.getByText(/לשאלה הזו עדיין אין גרסת/)).toHaveTextContent('C#');
    expect(screen.getByRole('link', { name: /צור ידנית/ })).toHaveAttribute('href', '/teacher/questions/q1?variant=csharp');
    expect(screen.getByRole('button', { name: /הצע באמצעות AI/ })).toBeDisabled();
    expect(screen.queryByText('מערכים')).toBeNull();
  });

  it('explains an unclassified question and shows OK when nothing blocks', () => {
    const { rerender } = render(<MemoryRouter><BlockersPanel status={status([
      { assignment_question_id: 'a1', question_id: 'q1', title: 'x', status: 'unclassified' }])} /></MemoryRouter>);
    expect(screen.getByText(/לא הוגדרה שפה/)).toBeInTheDocument();
    rerender(<MemoryRouter><BlockersPanel status={status([{ assignment_question_id: 'a1', question_id: 'q1', title: 'x', status: 'ok' }])} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('לכל השאלות יש תוכן בשפת המטלה');
  });

  it('renders nothing for non-programming assignments', () => {
    const { container } = render(<MemoryRouter><BlockersPanel status={{ language: null, items: [] }} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
