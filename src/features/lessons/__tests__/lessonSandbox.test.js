import { describe, expect, it } from 'vitest';
import { buildSrcdoc, CSP, readFrameMessage, safeJson, SANDBOX } from '../lessonSandbox';
import { progressKey, readProgress, writeProgress } from '../lessonProgress';

const init = { token: 'tok', progress: { step: 2 }, vh: 700 };

describe('sandbox', () => {
  it('grants scripts only: never same-origin, popups, forms, top-navigation, downloads or modals', () => {
    expect(SANDBOX).toBe('allow-scripts');
  });
  it('CSP forbids every network path and objects/frames/forms/base', () => {
    for (const d of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) expect(CSP).toContain(d);
    expect(CSP).not.toMatch(/https?:|\*|unsafe-eval/);
  });
  it('the CSP meta is the first element in head, before any lesson content, and a lesson cannot override it', () => {
    const html = '<!DOCTYPE html><html lang="he"><head><base href="https://evil/"><meta http-equiv="refresh" content="0;url=https://evil"><style>b{}</style><!-- <head> --></head><body><p>x</p></body></html>';
    const out = buildSrcdoc(html, init);
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.head.firstElementChild.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(doc.head.firstElementChild.getAttribute('content')).toBe(CSP);
    expect(doc.querySelectorAll('base, meta[http-equiv="refresh"]').length).toBe(0);
    expect(doc.documentElement.getAttribute('lang')).toBe('he');
    expect(doc.querySelector('style')).not.toBeNull();
    expect(doc.body.textContent).toContain('x');
  });
  it('init data cannot break out of the bridge script', () => {
    const out = buildSrcdoc('<!DOCTYPE html><html><head></head><body></body></html>', { token: 't', progress: { x: '</script><img src=x onerror=1>' }, vh: 1 });
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(doc.querySelectorAll('img').length).toBe(0);
    expect(safeJson({ a: '<\u2028>' })).not.toMatch(/[<>\u2028]/);
  });
  it('validates frame messages: same window + token, clamps height, caps progress size', () => {
    const win = {}; const other = {};
    const msg = (data, source = win) => ({ source, data });
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'height', h: 900 }), win, 'tok')).toEqual({ type: 'height', h: 900 });
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'height', h: 5 }), win, 'tok').h).toBeGreaterThanOrEqual(200);
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'height', h: 1e9 }), win, 'tok').h).toBeLessThanOrEqual(40000);
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'height', h: 900 }, other), win, 'tok')).toBeNull();
    expect(readFrameMessage(msg({ hevanti: 1, token: 'bad', type: 'height', h: 900 }), win, 'tok')).toBeNull();
    expect(readFrameMessage(msg({ type: 'height', h: 900 }), win, 'tok')).toBeNull();
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'progress', value: 'x'.repeat(70000) }), win, 'tok')).toBeNull();
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'progress', value: { s: 1 } }), win, 'tok')).toEqual({ type: 'progress', value: { s: 1 } });
    expect(readFrameMessage(msg({ hevanti: 1, token: 'tok', type: 'navigate', url: 'https://x' }), win, 'tok')).toBeNull();
  });
});

describe('local progress is per user + lesson + published version', () => {
  it('a new version never loads the previous progress; same version does', () => {
    window.localStorage.clear();
    const v1 = progressKey('u1', 'L', 'ver1'); const v2 = progressKey('u1', 'L', 'ver2');
    expect(writeProgress(v1, { step: 3 })).toBe(true);
    expect(readProgress(v1)).toEqual({ step: 3 });
    expect(readProgress(v2)).toBeNull();
    expect(readProgress(progressKey('u2', 'L', 'ver1'))).toBeNull();
    expect(writeProgress(v1, 'x'.repeat(70000))).toBe(false);
    expect(readProgress(v1)).toEqual({ step: 3 });
  });
});
