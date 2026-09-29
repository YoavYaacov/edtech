import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Logo from '../Logo';
import { app } from '../../../i18n/he';

describe('Logo', () => {
  it('brand strings are the approved ones', () => {
    expect(app.name).toBe('הבנתי');
    expect(app.tagline).toBe('עד שנופל האסימון');
  });

  it('full variant: symbol + name + slogan, real Hebrew text', () => {
    const { container } = render(<Logo variant="full" size="lg" />);
    expect(screen.getByText('הבנתי')).toBeInTheDocument();
    expect(screen.getByText('עד שנופל האסימון')).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('compact variant (default): symbol + name, no slogan', () => {
    const { container } = render(<Logo />);
    expect(screen.getByText('הבנתי')).toBeInTheDocument();
    expect(screen.queryByText('עד שנופל האסימון')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('the symbol is decorative (empty alt, hidden from assistive tech)', () => {
    const { container } = render(<Logo size="sm" />);
    const img = container.querySelector('img');
    expect(img.getAttribute('alt')).toBe('');
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });

  it('no trace of the old brand name in the rendered logo', () => {
    const { container } = render(<Logo variant="full" />);
    expect(container.textContent).not.toMatch(/חוליה/);
  });
});
