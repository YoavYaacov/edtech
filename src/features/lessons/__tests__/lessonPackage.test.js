import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseLessonFile, resolveRef, cleanPath, LIMITS } from '../lessonPackage';

const file = async (name, parts) => {
  if (typeof parts === 'string') return new File([parts], name);
  const zip = new JSZip();
  for (const [k, v] of Object.entries(parts)) zip.file(k, v);
  const blob = await zip.generateAsync({ type: 'uint8array' });
  return new File([blob], name);
};
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const page = (head, body = '<p>שלום</p>') => `<!doctype html><html><head><meta charset="utf-8"><title>כותרת</title>${head}</head><body>${body}</body></html>`;
const codes = (r, k = 'errors') => r[k].map((e) => e.code);

describe('paths', () => {
  it('rejects traversal / absolute / NUL, resolves relative refs inside the package only', () => {
    expect(cleanPath('a/../b')).toBeNull();
    expect(cleanPath('/etc/passwd')).toBeNull();
    expect(cleanPath('C:/x')).toBeNull();
    expect(cleanPath('a\0b')).toBeNull();
    expect(cleanPath('a\\b.css')).toBe('a/b.css');
    expect(resolveRef('css/site.css', '../img/a.png?x#y')).toBe('img/a.png');
    expect(resolveRef('index.html', '../outside.png')).toBeNull();
  });
});

describe('bundling a ZIP', () => {
  it('inlines css, js, images, fonts-in-css and @import; result has no external reference', async () => {
    const r = await parseLessonFile(await file('l.zip', {
      'hevanti.json': JSON.stringify({ format: 1, lessonId: 'demo-lesson', title: 'דמו' }),
      'index.html': page('<link rel="stylesheet" href="css/a.css"><script src="js/app.js"></script>', '<img src="img/p.png" alt=""><div style="background:url(img/p.png)">x</div>'),
      'css/a.css': '@import "b.css"; body{background:url(../img/p.png)} @font-face{font-family:f;src:url(../img/p.png)}',
      'css/b.css': 'h1{color:red}',
      'js/app.js': 'document.title="x";',
      'img/p.png': PNG,
    }));
    expect(r.ok).toBe(true);
    expect(r.lessonKey).toBe('demo-lesson');
    expect(r.html.startsWith('<!DOCTYPE html>\n<html')).toBe(true);
    expect(r.html).toContain('<head>');
    expect(r.html).toContain('h1{color:red}');
    expect(r.html).toContain('data:image/png;base64,');
    expect(r.html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(r.html).not.toMatch(/\ssrc="(?!data:)/i);
    expect(r.html).not.toMatch(/url\((?!(?:&quot;|")data:)/i);
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('strips a single wrapping folder and reads the manifest from there', async () => {
    const r = await parseLessonFile(await file('l.zip', {
      'pkg/hevanti.json': JSON.stringify({ lessonId: 'wrapped-one' }),
      'pkg/index.html': page(''),
    }));
    expect(r.ok).toBe(true);
    expect(r.lessonKey).toBe('wrapped-one');
  });
  it('reports external resources, missing assets, module imports and disallowed files as errors', async () => {
    const r = await parseLessonFile(await file('l.zip', {
      'index.html': page('<script src="https://cdn.example.com/x.js"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css">', '<img src="nope.png"><script type="module">import {a} from "./a.js";</script>'),
      'run.exe': 'MZ',
    }));
    expect(r.ok).toBe(false);
    expect(codes(r)).toEqual(expect.arrayContaining(['external_resource', 'missing_asset', 'module_imports', 'disallowed_file']));
    expect(r.html).toBeNull();
  });
  it('rejects path traversal inside the zip and too many files', async () => {
    const zip = new JSZip();
    zip.file('a\\..\\evil.html', 'x'); zip.file('index.html', page(''));
    const bad = await parseLessonFile(new File([await zip.generateAsync({ type: 'uint8array' })], 'z.zip'));
    expect(bad.ok).toBe(false);
    expect(codes(bad)).toContain('bad_path');
    expect(LIMITS.entries).toBeGreaterThan(0);
  });
  it('needs an entry html', async () => {
    const r = await parseLessonFile(await file('l.zip', { 'a.html': page(''), 'b.html': page('') }));
    expect(codes(r)).toContain('no_entry');
  });
  it('rejects unsupported types and oversized files', async () => {
    expect(codes(await parseLessonFile(new File(['x'], 'a.pdf')))).toContain('unsupported_type');
    const big = { name: 'a.html', size: LIMITS.fileBytes + 1 };
    expect(codes(await parseLessonFile(big))).toContain('file_too_large');
  });
});

describe('single HTML + sanitising', () => {
  it('reads the manifest from the json script and removes it from the bundle', async () => {
    const r = await parseLessonFile(await file('a.html', page('<script type="application/json" id="hevanti-manifest">{"lessonId":"single-html","topicPaths":[["יחידה","נושא"]]}</script>')));
    expect(r.ok).toBe(true);
    expect(r.manifest.topicPaths).toEqual([['יחידה', 'נושא']]);
    expect(r.html).not.toContain('hevanti-manifest');
  });
  it('removes base/meta refresh/iframes/forms actions/links; keeps #anchors; warns', async () => {
    const r = await parseLessonFile(await file('a.html', page('<base href="https://x.com/"><meta http-equiv="refresh" content="0;url=https://x.com">',
      '<iframe src="data:text/html,x"></iframe><form action="https://x.com"><input></form><a href="https://x.com">x</a><a href="#s1">in</a><object data="a"></object>')));
    expect(r.ok).toBe(true);
    expect(r.html).not.toMatch(/<base|http-equiv|<iframe|<object|action=/i);
    expect(r.html).toContain('href="#s1"');
    expect(r.html).not.toContain('https://x.com');
    expect(codes(r, 'warnings')).toEqual(expect.arrayContaining(['link_removed', 'embed_removed']));
  });
  it('escapes </script inside inlined code so the bundle cannot break out', async () => {
    const r = await parseLessonFile(await file('l.zip', {
      'index.html': page('<script src="a.js"></script>'),
      'a.js': 'var s = "</script><img src=x onerror=alert(1)>";',
    }));
    expect(r.ok).toBe(true);
    expect(new DOMParser().parseFromString(r.html, 'text/html').querySelectorAll('img[src="x"]').length).toBe(0);
  });
  it('warns about network / storage APIs and URL literals in code (CSP blocks them at runtime anyway)', async () => {
    const r = await parseLessonFile(await file('a.html', page('', '<script>fetch("https://api.x.com/a");localStorage.x=1;</script><svg xmlns="http://www.w3.org/2000/svg"></svg>')));
    expect(r.ok).toBe(true);
    expect(codes(r, 'warnings')).toEqual(expect.arrayContaining(['js_url', 'network_api', 'storage_api']));
  });
  it('derives a stable key from the title when no lessonId is given (and warns)', async () => {
    const r = await parseLessonFile(await file('a.html', page('')));
    expect(r.lessonKey).toBe('כותרת');
    expect(codes(r, 'warnings')).toContain('no_lesson_id');
  });
  it('same input => same hash; different input => different hash', async () => {
    const a = await parseLessonFile(await file('a.html', page('')));
    const b = await parseLessonFile(await file('b.html', page('')));
    const c = await parseLessonFile(await file('c.html', page('', '<p>אחר</p>')));
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
  });
  it('defaults to Hebrew RTL', async () => {
    const r = await parseLessonFile(await file('a.html', '<!doctype html><title>שיעור בדיקה</title><p>x</p>'));
    expect(r.html).toMatch(/<html[^>]*lang="he"[^>]*dir="rtl"|<html[^>]*dir="rtl"[^>]*lang="he"/);
  });
});
