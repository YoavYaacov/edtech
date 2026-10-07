// pdf.js is heavy: it loads only when a teacher actually picks a file or opens a source page (lazy chunk + its own worker).
// The LEGACY build is used on purpose: the modern one needs very recent JavaScript (Map.getOrInsertComputed) and fails on
// browsers a few versions old - it broke getOperatorList in a real Chromium run.
let cached = null;
export function loadPdfjs() {
  if (!cached) {
    cached = (async () => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })().catch((e) => { cached = null; throw e; });
  }
  return cached;
}
