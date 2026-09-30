import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// jsdom does not compute layout, so the mobile fixes are pinned at the source level.
// Each guard names the real-device failure it prevents (Mobile Notifications QA).
const SRC = join(process.cwd(), 'src');
const read = (p) => readFileSync(join(SRC, p), 'utf8');
const shell = read('layouts/AppShell.module.css');
const notif = read('features/notifications/notifications.module.css');

// The body of the LAST `selector { ... }` block in css (the mobile media block comes after the base rules).
function block(css, selector) {
  const i = css.lastIndexOf(`${selector} {`);
  if (i < 0) return null;
  const start = css.indexOf('{', i) + 1;
  return css.slice(start, css.indexOf('}', start));
}
const zIndexOf = (b) => Number(/z-index:\s*(\d+)/.exec(b)?.[1]);

describe('mobile notification panel layout guards', () => {
  it('the mobile header itself has no backdrop-filter (it would trap the position:fixed panel inside the 56px header); the blur lives on ::before', () => {
    expect(block(shell, '.topbar')).not.toMatch(/backdrop-filter|filter:|transform:|perspective:/);
    expect(block(shell, '.topbar::before')).toMatch(/backdrop-filter:\s*blur/);
  });

  it('the header stacks above the bottom tab bar, so the full-screen panel is not covered by the tabs', () => {
    expect(zIndexOf(block(shell, '.topbar'))).toBeGreaterThan(zIndexOf(block(shell, '.tabbar')));
  });

  it('mobile touch targets are at least 44px (bell, close, header buttons)', () => {
    const mobile = notif.slice(notif.lastIndexOf('@media (max-width: 800px)'));
    expect(mobile).toMatch(/\.bellButton\s*\{\s*width:\s*44px;\s*height:\s*44px;/);
    expect(mobile).toMatch(/\.closeBtn\s*\{\s*width:\s*44px;\s*height:\s*44px;/);
    expect(shell).toMatch(/\.topbarActions \.iconButton\s*\{\s*width:\s*44px;\s*height:\s*44px;/);
  });

  it('mobile list wraps long unbroken words, contains its scroll, and respects safe areas', () => {
    const mobile = notif.slice(notif.lastIndexOf('@media (max-width: 800px)'));
    expect(mobile).toMatch(/overflow-wrap:\s*anywhere/);
    expect(mobile).toMatch(/overscroll-behavior:\s*contain/);
    expect(mobile).toMatch(/overflow-x:\s*hidden/);
    expect(mobile).toMatch(/safe-area-inset-top/);
    expect(mobile).toMatch(/safe-area-inset-bottom/);
  });

  it('the desktop popover rules are untouched by the mobile fixes (still anchored beside the sidebar)', () => {
    const panel = block(notif.slice(0, notif.indexOf('@media (max-width: 800px)')), '.panel');
    expect(panel).toMatch(/position:\s*fixed/);
    expect(panel).toMatch(/inset-inline-start:\s*calc\(var\(--nav-width\)/);
    expect(panel).toMatch(/max-height:\s*min\(560px/);
  });
});
