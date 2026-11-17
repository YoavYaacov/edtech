// Turns an uploaded lesson (single .html or .zip) into ONE self-contained, sanitised HTML document.
// Everything runs in the teacher's browser; nothing is executed here (DOMParser is inert).
// Result: { ok, errors:[{code,detail?}], warnings:[{code,detail?}], manifest, title, lessonKey, html, hash, size, fileCount }
// The student never receives the original package, only this bundle; it has no external references at all.
import JSZip from 'jszip';
import { MANIFEST_FILE, MANIFEST_SCRIPT_ID, slugKey, validateManifest } from './lessonFormat';

export const LIMITS = {
  fileBytes: 10 * 1024 * 1024,
  entries: 400,
  unzippedBytes: 30 * 1024 * 1024,
  bundleBytes: 6 * 1024 * 1024,   // must equal the CHECK in lesson_bundles
};

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm',
};
const TEXT_EXT = new Set(['html', 'htm', 'css', 'js', 'mjs', 'json', 'svg', 'txt']);
const ALLOWED = new Set([...TEXT_EXT, ...Object.keys(MIME)]);
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;   // any scheme or protocol-relative
const SAFE_SCHEME = /^(?:data|blob):/i;

const ext = (p) => (p.includes('.') ? p.split('.').pop().toLowerCase() : '');
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export function cleanPath(raw) {
  if (typeof raw !== 'string' || raw.includes('\0')) return null;
  const p = raw.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-z]:/i.test(p)) return null;
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

// Resolves a reference found inside `fromPath` to a normalised package path ('..' may go UP but never above the root).
export function resolveRef(fromPath, ref) {
  const noQuery = ref.split('#')[0].split('?')[0];
  if (!noQuery) return null;
  const out = dirOf(fromPath) ? dirOf(fromPath).split('/') : [];
  let decoded;
  try { decoded = decodeURIComponent(noQuery); } catch { decoded = noQuery; }
  for (const seg of decoded.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
  }
  return out.length ? out.join('/') : null;
}

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function sha256Hex(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const readText = (file) => (typeof file.text === 'function' ? file.text() : new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file);
}));
const readBuf = (file) => (typeof file.arrayBuffer === 'function' ? file.arrayBuffer() : new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file);
}));

// ---- file collection ----
async function collectZip(file, errors) {
  let zip;
  try { zip = await JSZip.loadAsync(await readBuf(file)); } catch { errors.push({ code: 'zip_unreadable' }); return null; }
  const entries = Object.values(zip.files).filter((e) => !e.dir && !/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(e.name));
  if (entries.length > LIMITS.entries) { errors.push({ code: 'too_many_files', detail: String(entries.length) }); return null; }
  let declared = 0;
  for (const e of entries) declared += e._data?.uncompressedSize ?? 0;
  if (declared > LIMITS.unzippedBytes) { errors.push({ code: 'too_large_unzipped' }); return null; }

  const paths = entries.map((e) => ({ e, p: cleanPath(e.name) }));
  const bad = paths.filter((x) => !x.p);
  if (bad.length) { errors.push({ code: 'bad_path', detail: bad[0].e.name }); return null; }
  // a single top-level folder wrapping everything is stripped
  const tops = new Set(paths.map((x) => x.p.split('/')[0]));
  const strip = tops.size === 1 && paths.every((x) => x.p.includes('/'));
  const files = new Map();
  let total = 0;
  for (const { e, p } of paths) {
    const path = strip ? p.slice(p.indexOf('/') + 1) : p;
    const x = ext(path);
    if (!ALLOWED.has(x)) { errors.push({ code: 'disallowed_file', detail: path }); continue; }
    const data = await e.async(TEXT_EXT.has(x) ? 'string' : 'uint8array');
    total += typeof data === 'string' ? data.length : data.length;
    if (total > LIMITS.unzippedBytes) { errors.push({ code: 'too_large_unzipped' }); return null; }
    files.set(path, data);
  }
  return files;
}

function pickEntry(files, errors) {
  if (files.has('index.html')) return 'index.html';
  const htmls = [...files.keys()].filter((p) => !p.includes('/') && /\.html?$/i.test(p));
  if (htmls.length === 1) return htmls[0];
  errors.push({ code: 'no_entry' });
  return null;
}

// ---- bundling ----
function makeContext(files, errors, warnings) {
  const lookup = (path) => {
    if (files.has(path)) return path;
    const low = path.toLowerCase();
    for (const k of files.keys()) if (k.toLowerCase() === low) return k;
    return null;
  };
  const note = (list, code, detail) => { if (!list.some((x) => x.code === code && x.detail === detail)) list.push({ code, detail }); };

  // returns a data: URI, '' (keep as is: data:/blob:/#), or null (already reported)
  function toDataUri(from, ref) {
    const r = ref.trim();
    if (!r || r.startsWith('#') || SAFE_SCHEME.test(r)) return '';
    if (EXTERNAL.test(r)) { note(errors, 'external_resource', r.slice(0, 120)); return null; }
    const path = resolveRef(from, r);
    const hit = path && lookup(path);
    if (!hit) { note(errors, 'missing_asset', r.slice(0, 120)); return null; }
    const x = ext(hit); const mime = MIME[x];
    if (!mime) { note(errors, 'disallowed_file', hit); return null; }
    const data = files.get(hit);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return `data:${mime};base64,${toBase64(bytes)}`;
  }

  function inlineCss(css, cssPath, depth = 0, seen = new Set()) {
    let out = css.replace(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^)\s;]+))\s*\)?[^;]*;/gi, (_m, a, b, c) => {
      const ref = a || b || c;
      if (EXTERNAL.test(ref) && !SAFE_SCHEME.test(ref)) { note(errors, 'external_resource', ref.slice(0, 120)); return ''; }
      const path = resolveRef(cssPath, ref); const hit = path && lookup(path);
      if (!hit || depth >= 5 || seen.has(hit)) { note(errors, hit ? 'css_import_loop' : 'missing_asset', ref.slice(0, 120)); return ''; }
      return inlineCss(String(files.get(hit)), hit, depth + 1, new Set([...seen, hit]));
    });
    out = out.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (m, a, b, c) => {
      const ref = a ?? b ?? c ?? '';
      const uri = toDataUri(cssPath, ref);
      return uri === '' || uri === null ? m : `url("${uri}")`;
    });
    return out;
  }
  return { lookup, toDataUri, inlineCss, note };
}

const jsSafe = (code) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

function scanScript(code, warnings) {
  const urls = code.match(/https?:\/\/(?!www\.w3\.org\/)[^\s'"`)<>]+/gi);
  if (urls) warnings.push({ code: 'js_url', detail: urls[0].slice(0, 100) });
  if (/\b(fetch\s*\(|XMLHttpRequest\b|WebSocket\b|EventSource\b|sendBeacon\b|importScripts\b)/.test(code)) warnings.push({ code: 'network_api' });
  if (/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/.test(code)) warnings.push({ code: 'storage_api' });
}

export function bundleHtml(entryPath, files, errors, warnings) {
  const ctx = makeContext(files, errors, warnings);
  const doc = new DOMParser().parseFromString(String(files.get(entryPath)), 'text/html');

  doc.querySelectorAll('base, meta[http-equiv], link[rel~="preload"], link[rel~="prefetch"], link[rel~="modulepreload"], link[rel~="preconnect"], link[rel~="dns-prefetch"], link[rel~="manifest"], link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel~="shortcut"]')
    .forEach((n) => n.remove());
  doc.querySelectorAll('iframe, frame, object, embed, applet').forEach((n) => { ctx.note(warnings, 'embed_removed', n.tagName.toLowerCase()); n.remove(); });
  doc.getElementById(MANIFEST_SCRIPT_ID)?.remove();

  // stylesheets
  doc.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => {
    const href = l.getAttribute('href') || '';
    if (EXTERNAL.test(href) && !SAFE_SCHEME.test(href)) { ctx.note(errors, 'external_resource', href.slice(0, 120)); return; }
    const path = resolveRef(entryPath, href); const hit = path && ctx.lookup(path);
    if (!hit) { ctx.note(errors, 'missing_asset', href.slice(0, 120)); return; }
    const style = doc.createElement('style');
    style.textContent = ctx.inlineCss(String(files.get(hit)), hit);
    l.replaceWith(style);
  });
  doc.querySelectorAll('style').forEach((s) => { s.textContent = ctx.inlineCss(s.textContent, entryPath); });
  doc.querySelectorAll('[style]').forEach((n) => {
    const v = n.getAttribute('style');
    if (/url\(/i.test(v)) n.setAttribute('style', ctx.inlineCss(v, entryPath));
  });

  // scripts
  doc.querySelectorAll('script').forEach((s) => {
    const src = s.getAttribute('src');
    let code = s.textContent;
    if (src != null) {
      if (EXTERNAL.test(src) && !SAFE_SCHEME.test(src)) { ctx.note(errors, 'external_resource', src.slice(0, 120)); return; }
      const path = resolveRef(entryPath, src); const hit = path && ctx.lookup(path);
      if (!hit) { ctx.note(errors, 'missing_asset', src.slice(0, 120)); return; }
      code = String(files.get(hit));
      s.removeAttribute('src');
    }
    for (const a of ['integrity', 'crossorigin', 'nomodule', 'defer', 'async']) s.removeAttribute(a);
    if ((s.getAttribute('type') || '').toLowerCase() === 'module' && /(^|\n)\s*import\s|\bimport\s*\(/.test(code)) {
      ctx.note(errors, 'module_imports'); return;
    }
    const t = (s.getAttribute('type') || '').toLowerCase();
    if (!t || t === 'module' || t.includes('javascript')) scanScript(code, warnings);
    s.textContent = jsSafe(code);
  });

  // media & other URL attributes
  const urlAttrs = [['img', 'src'], ['source', 'src'], ['video', 'src'], ['video', 'poster'], ['audio', 'src'], ['track', 'src'], ['image', 'href'], ['image', 'xlink:href'], ['input', 'src']];
  for (const [tag, attr] of urlAttrs) {
    doc.querySelectorAll(`${tag}[${CSS_ESC(attr)}]`).forEach((n) => {
      const uri = ctx.toDataUri(entryPath, n.getAttribute(attr));
      if (uri) n.setAttribute(attr, uri);
    });
  }
  doc.querySelectorAll('img[srcset], source[srcset]').forEach((n) => {
    const parts = n.getAttribute('srcset').split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      const [u, ...rest] = x.split(/\s+/); const uri = ctx.toDataUri(entryPath, u);
      return `${uri || u}${rest.length ? ' ' + rest.join(' ') : ''}`;
    });
    n.setAttribute('srcset', parts.join(', '));
  });
  doc.querySelectorAll('use[href], use[xlink\\:href]').forEach((n) => {
    const v = n.getAttribute('href') || n.getAttribute('xlink:href') || '';
    if (v && !v.startsWith('#')) { ctx.note(warnings, 'use_external_removed', v.slice(0, 80)); n.remove(); }
  });
  doc.querySelectorAll('form[action]').forEach((n) => n.removeAttribute('action'));
  doc.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (!h.startsWith('#')) { ctx.note(warnings, 'link_removed', h.slice(0, 80)); a.removeAttribute('href'); }
  });

  // final sweep: nothing external may remain in any attribute
  doc.querySelectorAll('*').forEach((n) => {
    for (const a of Array.from(n.attributes)) {
      if (['href', 'src', 'poster', 'action', 'data'].includes(a.name) && EXTERNAL.test(a.value.trim()) && !SAFE_SCHEME.test(a.value.trim())) {
        ctx.note(errors, 'external_resource', a.value.slice(0, 120));
      }
    }
  });

  if (!doc.head.querySelector('meta[charset]')) {
    const c = doc.createElement('meta'); c.setAttribute('charset', 'utf-8'); doc.head.insertBefore(c, doc.head.firstChild);
  }
  if (!doc.head.querySelector('meta[name="viewport"]')) {
    const m = doc.createElement('meta'); m.setAttribute('name', 'viewport'); m.setAttribute('content', 'width=device-width, initial-scale=1'); doc.head.appendChild(m);
  }
  const root = doc.documentElement;
  if (!root.getAttribute('lang')) root.setAttribute('lang', 'he');
  if (!root.getAttribute('dir')) root.setAttribute('dir', 'rtl');
  const attrs = Array.from(root.attributes).map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
  return { html: `<!DOCTYPE html>\n<html${attrs}><head>${doc.head.innerHTML}</head>${doc.body.outerHTML}</html>`, title: doc.title?.trim() || '' };
}
const CSS_ESC = (a) => a.replace(':', '\\:');

function readManifest(files, entryPath, errors) {
  let raw = null; let source = null;
  if (files.has(MANIFEST_FILE)) {
    try { raw = JSON.parse(String(files.get(MANIFEST_FILE))); source = 'file'; } catch { errors.push({ code: 'manifest_invalid' }); }
  } else {
    const doc = new DOMParser().parseFromString(String(files.get(entryPath)), 'text/html');
    const s = doc.getElementById(MANIFEST_SCRIPT_ID);
    if (s) { try { raw = JSON.parse(s.textContent); source = 'script'; } catch { errors.push({ code: 'manifest_invalid' }); } }
  }
  const { manifest, problems } = validateManifest(raw);
  for (const p of problems) errors.push({ code: p });
  return { manifest, source };
}

export async function parseLessonFile(file) {
  const errors = []; const warnings = [];
  const name = file.name || 'lesson';
  const fail = () => ({ name, ok: false, errors, warnings, manifest: null, html: null });
  if (file.size > LIMITS.fileBytes) { errors.push({ code: 'file_too_large' }); return fail(); }

  let files;
  const x = ext(name);
  if (x === 'zip') {
    files = await collectZip(file, errors);
    if (!files) return fail();
  } else if (x === 'html' || x === 'htm') {
    files = new Map([['index.html', await readText(file)]]);
  } else { errors.push({ code: 'unsupported_type' }); return fail(); }

  const entry = pickEntry(files, errors);
  if (!entry) return fail();
  const { manifest } = readManifest(files, entry, errors);
  const bundled = bundleHtml(entry, files, errors, warnings);
  const size = new TextEncoder().encode(bundled.html).length;
  if (size > LIMITS.bundleBytes) errors.push({ code: 'bundle_too_large', detail: String(size) });
  if (errors.length) return { name, ok: false, errors, warnings, manifest, html: null };

  const title = manifest?.title || bundled.title || name.replace(/\.[^.]+$/, '');
  const lessonKey = manifest?.lessonId || slugKey(title);
  if (!manifest?.lessonId) warnings.push({ code: lessonKey ? 'no_lesson_id' : 'no_lesson_id_unusable' });
  if (!lessonKey) { errors.push({ code: 'no_lesson_key' }); return { name, ok: false, errors, warnings, manifest, html: null }; }
  const hash = await sha256Hex(bundled.html);
  return { name, ok: true, errors, warnings, manifest, title, lessonKey, html: bundled.html, hash, size, fileCount: files.size };
}
