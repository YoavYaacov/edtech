// R1B-1 — checks done in the browser BEFORE anything is uploaded or sent to an AI service.
// The server (finalize_import_upload) enforces the same limits and stays the authority; these only save the teacher a
// pointless upload. The numbers mirror private.import_settings (max_file_bytes, max_pages, scanned_*).
// Nothing here is specific to any particular PDF.

export const LIMITS = { maxBytes: 20 * 1024 * 1024, maxPages: 30, maxCandidates: 60, scannedMinChars: 80, scannedMinTextPct: 30 };

// Returns null when fine, otherwise a reason code.
export function checkFile(file, limits = LIMITS) {
  if (!file) return 'no_file';
  const nameOk = /\.pdf$/i.test(file.name ?? '');
  if (file.type !== 'application/pdf' && !(file.type === '' && nameOk)) return 'not_pdf';
  if (!(file.size > 0)) return 'empty_file';
  if (file.size > limits.maxBytes) return 'file_too_large';
  return null;
}

// pageStats: [{ chars, images }]. Mirrors the server: a PDF with too few text pages is treated as scanned.
export function checkPdfStats(pageCount, pageStats, limits = LIMITS) {
  if (!Number.isInteger(pageCount) || pageCount < 1) return 'unreadable';
  if (pageCount > limits.maxPages) return 'too_many_pages';
  if (Array.isArray(pageStats) && pageStats.length > 0) {
    const textPages = pageStats.filter((s) => (s?.chars ?? 0) >= limits.scannedMinChars).length;
    if (textPages * 100 < pageStats.length * limits.scannedMinTextPct) return 'scanned_pdf';
  }
  return null;
}

export async function sha256Hex(buffer, subtle = globalThis.crypto?.subtle) {
  const digest = await subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}



// Returns { pageCount, pageStats: [{ chars, images }] } or throws (an unreadable / encrypted PDF).
export async function analyzePdf(buffer) {
  const { loadPdfjs } = await import('./pdfLoader');
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false });
  const doc = await task.promise;
  try {
    const pageStats = [];
    const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]);
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      let chars = 0; let images = 0;
      try {
        const text = await page.getTextContent();
        chars = text.items.reduce((s, it) => s + (typeof it.str === 'string' ? it.str.length : 0), 0);
      } catch { /* a page without readable text counts as 0 characters */ }
      try {
        const ops = await page.getOperatorList();
        images = ops.fnArray.filter((f) => imageOps.has(f)).length;
      } catch { /* image count is informational only */ }
      pageStats.push({ chars, images });
      page.cleanup();
    }
    return { pageCount: doc.numPages, pageStats };
  } finally {
    await doc.destroy();
  }
}
