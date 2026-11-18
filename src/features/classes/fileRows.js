import JSZip from 'jszip';

const MAX_BYTES = 2 * 1024 * 1024;

const decode = (s) => s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, e) => {
  if (e === 'amp') return '&';
  if (e === 'lt') return '<';
  if (e === 'gt') return '>';
  if (e === 'quot') return '"';
  if (e === 'apos') return "'";
  return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
});
const textOf = (xml) => decode([...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''));
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Reads the first sheet of an .xlsx into rows of strings (no formulas evaluated; cached values are used).
export async function readXlsxRows(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const get = async (name) => (zip.file(name) ? zip.file(name).async('string') : '');
  const shared = [...(await get('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const first = /<sheet\b[^>]*?r:id="([^"]+)"/.exec(await get('xl/workbook.xml'));
  if (first) {
    const rel = new RegExp(`<Relationship\\b[^>]*?(?:Id="${first[1]}"[^>]*?Target="([^"]+)"|Target="([^"]+)"[^>]*?Id="${first[1]}")`).exec(await get('xl/_rels/workbook.xml.rels'));
    const target = rel && (rel[1] || rel[2]);
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const xml = await get(sheetPath);
  if (!xml) throw new Error('empty');
  const out = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cm[1]);
      if (!ref || !cm[2]) continue;
      const type = /\bt="([^"]+)"/.exec(cm[1])?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(cm[2]);
      else if (v != null) val = decode(v);
      row[colIndex(ref[1])] = val;
    }
    out.push(Array.from(row, (x) => x ?? ''));
  }
  return out;
}

// File (.xlsx / .csv / .txt) -> rows of strings. Throws Error('too_big' | 'type').
export async function readRosterFile(file) {
  if (file.size > MAX_BYTES) throw new Error('too_big');
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsxRows(await file.arrayBuffer());
  if (/\.(csv|txt|tsv)$/.test(name)) {
    const text = (await file.text()).replace(/^﻿/, '');
    return text.split(/\r?\n/).map((l) => (l.includes('\t') ? l.split('\t') : l.split(/[,;]/)));
  }
  throw new Error('type');
}
