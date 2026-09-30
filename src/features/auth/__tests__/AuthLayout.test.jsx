import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthLayout from '../AuthLayout';

describe('AuthLayout brand panel', () => {
  it('shows the full logo (name + slogan) and the form content', () => {
    render(<AuthLayout title="כניסה"><button>שלח</button></AuthLayout>);
    expect(screen.getByText('הבנתי')).toBeInTheDocument();
    expect(screen.getByText('עד שנופל האסימון')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'כניסה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שלח' })).toBeInTheDocument();
  });

  it('the sketch layer is decorative: two images only (logo symbol + sketches), both hidden from assistive tech', () => {
    const { container } = render(<AuthLayout title="כניסה"><span /></AuthLayout>);
    const imgs = [...container.querySelectorAll('img')];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img.getAttribute('alt')).toBe('');
      expect(img).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('the old linked-list motif is gone from the panel', () => {
    const { container } = render(<AuthLayout title="כניסה"><span /></AuthLayout>);
    expect(container.textContent).not.toMatch(/head|null/);
  });
});
