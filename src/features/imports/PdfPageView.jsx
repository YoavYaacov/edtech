import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from '../../components/ui/Button';
import { importReview as t } from '../../i18n/he';
import { downloadSource } from './importsApi';
import { loadPdfjs } from './pdfLoader';
import styles from './review.module.css';

// One PDF per path is downloaded and parsed once; opening more pages of the same file is instant.
const docs = new Map();
function getDoc(path) {
  if (!docs.has(path)) {
    docs.set(path, (async () => {
      const { buffer, error } = await downloadSource(path);
      if (error) throw error;
      const pdfjs = await loadPdfjs();
      return pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise;
    })().catch((e) => { docs.delete(path); throw e; }));
  }
  return docs.get(path);
}

// Shows ONE page of the original PDF (read-only) with next / previous page for context.
export default function PdfPageView({ path, startPage, pageCount }) {
  const [page, setPage] = useState(startPage);
  const [state, setState] = useState('loading');
  const canvas = useRef(null);
  const box = useRef(null);

  useEffect(() => { setPage(startPage); }, [startPage, path]);

  useEffect(() => {
    let cancelled = false; let task = null;
    setState('loading');
    (async () => {
      try {
        const doc = await getDoc(path);
        const p = await doc.getPage(page);
        if (cancelled) return;
        const width = Math.max(280, box.current?.clientWidth ?? 600);
        const base = p.getViewport({ scale: 1 });
        const scale = Math.min(2.5, (width / base.width) * (window.devicePixelRatio || 1));
        const viewport = p.getViewport({ scale });
        const c = canvas.current;
        if (!c) return;
        c.width = Math.floor(viewport.width); c.height = Math.floor(viewport.height);
        c.style.width = '100%'; c.style.height = 'auto';
        task = p.render({ canvasContext: c.getContext('2d'), viewport });
        await task.promise;
        if (!cancelled) setState('ready');
      } catch (e) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') setState('error');
      }
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [path, page]);

  return (
    <div className={styles.pdfView} ref={box}>
      <div className={styles.pdfBar}>
        <Button variant="ghost" icon={ChevronRight} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>{t.source.prevPage}</Button>
        <span aria-live="polite">{t.source.page(page, pageCount)}</span>
        <Button variant="ghost" icon={ChevronLeft} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>{t.source.nextPage}</Button>
      </div>
      {state === 'loading' && <p className={styles.hint} role="status">{t.source.loading}</p>}
      {state === 'error' && <p className={styles.errorLine} role="alert">{t.source.failed}</p>}
      <canvas ref={canvas} className={styles.pdfCanvas} hidden={state === 'error'} aria-label={t.source.page(page, pageCount)} />
    </div>
  );
}
