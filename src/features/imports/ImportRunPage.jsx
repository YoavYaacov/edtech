import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Pause, Play } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { importReview as rv, imports as t } from '../../i18n/he';
import {
  archiveImport, fetchCandidatesSummary, fetchChunks, fetchImport, fetchSameFileImports, retryFailedChunks,
} from './importsApi';
import { computeProgress, titleOfCandidate } from './importProgress';
import { LIMITS } from './pdfPrecheck';
import { useImportDriver } from './useImportDriver';
import qStyles from '../questions/questions.module.css';
import styles from './imports.module.css';

const flagTone = { material: 'butter', info: 'neutral' };

export default function ImportRunPage() {
  const { importId } = useParams();
  const navigate = useNavigate();
  const [load, setLoad] = useState({ status: 'loading' });
  const [imp, setImp] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [cands, setCands] = useState([]);
  const [dups, setDups] = useState([]);
  const [dupDecided, setDupDecided] = useState(false);
  const [note, setNote] = useState('');
  const started = useRef(false);

  const refresh = useCallback(async () => {
    const [a, b, c] = await Promise.all([fetchImport(importId), fetchChunks(importId), fetchCandidatesSummary(importId)]);
    if (a.error || b.error || c.error) { setLoad((s) => (s.status === 'ready' ? s : { status: 'error' })); return null; }
    if (!a.data || a.data.archived_at) { setLoad({ status: 'notfound' }); return null; }
    setImp(a.data); setChunks(b.data ?? []); setCands(c.data ?? []); setLoad({ status: 'ready' });
    return { imp: a.data, chunks: b.data ?? [] };
  }, [importId]);

  const driver = useImportDriver(importId, { onProgress: () => { refresh(); } });

  // first load; then (once) decide whether to start processing by itself
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await refresh();
      if (!alive || !r) return;
      const file = r.imp.import_files?.[0];
      const prog = computeProgress(r.chunks, file?.page_count);
      if (r.imp.status === 'processing' && file) {
        if (prog.untouched) {
          const { data } = await fetchSameFileImports(file.sha256, importId);
          if (!alive) return;
          if (data?.length) { setDups(data); return; } // wait for the teacher's decision
        }
        if (!started.current) { started.current = true; driver.start(); }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId]);

  const file = imp?.import_files?.[0] ?? null;
  const prog = useMemo(() => computeProgress(chunks, file?.page_count), [chunks, file]);
  const running = driver.phase === 'running' || driver.phase === 'waiting';
  const blockedByDup = dups.length > 0 && !dupDecided;

  function continueAnyway() { setDupDecided(true); started.current = true; driver.start(); }
  async function cancelDup() { await archiveImport(importId); navigate('/teacher/questions/import'); }
  async function retryFailed() {
    const { error } = await retryFailedChunks(importId);
    if (error) { setNote(t.run.retryFailedMsg); return; }
    setNote(t.run.retryDone);
    await refresh();
    started.current = true; driver.start();
  }
  function resume() { started.current = true; driver.start(); }

  if (load.status === 'loading') return <LoadingState />;
  if (load.status === 'error') return <ErrorState message={t.run.loadFailed} onRetry={refresh} />;
  if (load.status === 'notfound') {
    return <EmptyState title={t.run.notFound} action={<Link to="/teacher/questions/import" className={qStyles.linkButton}>{t.backToList}</Link>} />;
  }

  const status = imp.status;
  const stateLine = (() => {
    if (driver.phase === 'stopped') return t.run.stopErrors[driver.error] ?? t.run.stopErrors.default;
    if (driver.phase === 'budget') return t.run.states.budget;
    if (driver.phase === 'not_processing') return t.run.states.notProcessing;
    if (status === 'review') return t.run.statusReview;
    if (status === 'failed') return t.run.statusFailed;
    return null;
  })();

  return (
    <>
      <Link to="/teacher/questions/import" className={qStyles.backLink}><ArrowRight size={16} aria-hidden="true" />{t.backToList}</Link>
      <PageHeader title={imp.source_name || file?.original_name || t.title}
        subtitle={[imp.courses?.title && t.run.course(imp.courses.title), file && t.pagesOf(file.page_count)].filter(Boolean).join(' · ')}
        actions={<Badge tone={t.statusTones[status] ?? 'neutral'}>{t.statuses[status] ?? status}</Badge>} />

      {!file && <p className={styles.errorLine}>{t.run.needsFile} <Link to="/teacher/questions/import/new">{t.run.toNewImport}</Link></p>}

      {blockedByDup && (
        <section className={`${styles.card} ${styles.warn}`} role="alert">
          <h2 className={styles.cardTitle}><AlertTriangle size={18} aria-hidden="true" /> {t.run.duplicateTitle}</h2>
          <p>{t.run.duplicateBody}</p>
          <div className={styles.formActions}>
            {dups.map((d) => <Link key={d.importId} to={`/teacher/questions/import/${d.importId}`} className={styles.inlineLink}>{t.run.duplicateOpen(d.name)}</Link>)}
            <Button onClick={continueAnyway}>{t.run.duplicateContinue}</Button>
            <Button variant="ghost" onClick={cancelDup}>{t.run.duplicateCancel}</Button>
          </div>
        </section>
      )}

      {file && status === 'processing' && !blockedByDup && (
        <section className={styles.card} aria-label={t.statuses.processing}>
          <div className={styles.progressHead}>
            <strong>
              {running && prog.current ? t.run.working(prog.current.from, prog.current.to, prog.pageCount) : (driver.phase === 'paused' ? t.run.states.paused : t.run.states.running)}
            </strong>
            <span>{t.run.progress(prog.pagesDone, prog.pageCount)}</span>
          </div>
          <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prog.percent}>
            <div className={styles.barFill} style={{ width: `${prog.percent}%` }} />
          </div>
          {driver.phase === 'waiting' && <p className={styles.hint}>{t.run.waitingRetry(Math.max(1, Math.round(driver.waitMs / 1000)))}</p>}
          <p className={styles.hint}>{t.run.keepOpen}</p>
          <div className={styles.formActions}>
            {running
              ? <Button variant="secondary" icon={Pause} onClick={driver.pause}>{t.run.pause}</Button>
              : <Button icon={Play} onClick={resume}>{t.run.resume}</Button>}
          </div>
        </section>
      )}

      {stateLine && (
        <p className={status === 'review' ? styles.okLine : styles.errorLine} role="status">
          {status === 'review' && <CheckCircle2 size={16} aria-hidden="true" />} {stateLine}
        </p>
      )}
      {note && <p className={styles.hint} role="status">{note}</p>}

      {prog.failed.length > 0 && (
        <section className={`${styles.card} ${styles.warn}`}>
          <h2 className={styles.cardTitle}><AlertTriangle size={18} aria-hidden="true" /> {t.run.failedChunksTitle}</h2>
          <p>{t.run.failedChunksBody(prog.failedText)}</p>
          {!running && <Button variant="secondary" onClick={retryFailed}>{t.run.retryFailed}</Button>}
        </section>
      )}
      {cands.length >= LIMITS.maxCandidates && (
        <section className={`${styles.card} ${styles.warn}`} role="status">
          <h2 className={styles.cardTitle}><AlertTriangle size={18} aria-hidden="true" /> {rv.limitTitle}</h2>
          <p>{rv.limitBody(LIMITS.maxCandidates)}</p>
        </section>
      )}
      {prog.hasMissing && (
        <section className={`${styles.card} ${styles.warn}`}>
          <h2 className={styles.cardTitle}><AlertTriangle size={18} aria-hidden="true" /> {t.run.missingTitle}</h2>
          <p>{t.run.missingBody(prog.missingText)}</p>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t.run.candidatesTitle} ({cands.length})</h2>
        <p className={styles.hint}>{t.run.candidatesBody}</p>
        {cands.length > 0 && (
          <div className={styles.formActions}>
            <Link to={`/teacher/questions/import/${importId}/review`} className={qStyles.linkButton}>
              {rv.openReviewCount(cands.filter((c) => c.review_status === 'pending').length)}</Link>
          </div>
        )}
        {cands.length === 0 ? <p className={styles.hint}>{t.run.candidatesEmpty}</p> : (
          <ul className={styles.candList}>
            {cands.map((c) => (
              <li key={c.id} className={styles.cand}>
                <Link to={`/teacher/questions/import/${importId}/review?c=${c.id}`} className={styles.candTitle}>{titleOfCandidate(c) || t.run.candidateUntitled}</Link>
                <div className={styles.rowMeta}>
                  <span>{t.run.candidatePages(c.source_pages)}</span>
                  {c.source_label && <span dir="auto">{c.source_label}</span>}
                  <Badge tone={c.review_status === 'approved' ? 'mint' : c.review_status === 'rejected' ? 'rose' : 'neutral'}>{t.candidateStatus[c.review_status]}</Badge>
                  {(c.flags ?? []).map((f) => (
                    <Badge key={f.kind} tone={flagTone[f.severity] ?? 'neutral'}>{t.flags[f.kind] ?? f.kind}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
