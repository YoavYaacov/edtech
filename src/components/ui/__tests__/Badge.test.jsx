import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

const css = readFileSync(resolve(process.cwd(), 'src/components/ui/Badge.module.css'), 'utf8');
const rule = (sel) => (css.match(new RegExp(`${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`)) ?? [])[1] ?? '';

describe('Badge (R1B-3 uniform tags)', () => {
  it('renders its label with the tone', () => {
    render(<Badge tone="mint">מוכנה</Badge>);
    expect(screen.getByText('מוכנה').closest('span[data-tone]')).toHaveAttribute('data-tone', 'mint');
  });
  it('has one fixed size for every tone: height, padding, font, line-height, radius', () => {
    const r = rule('.badge');
    for (const prop of ['height', 'padding', 'font-size', 'font-weight', 'line-height', 'border-radius', 'align-items']) expect(r).toMatch(new RegExp(`${prop}\\s*:`));
    // tone rules may only change colours, never dimensions
    for (const tone of ['lavender', 'sky', 'mint', 'peach', 'butter', 'rose']) {
      const m = css.match(new RegExp(`\\.badge\\[data-tone='${tone}'\\]\\s*\\{([^}]*)\\}`));
      expect(m[1]).not.toMatch(/height|padding|font|line-height|radius/);
    }
  });
});
