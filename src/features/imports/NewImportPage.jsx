import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import TextField from '../../components/ui/TextField';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { fetchCourses } from '../content/contentApi';
import { common, questionLabels as L, imports as t } from '../../i18n/he';
import { createImport, finalizeUpload, sourcePath, uploadSource } from './importsApi';
import { analyzePdf, checkFile, checkPdfStats, sha256Hex } from './pdfPrecheck';
import qStyles from '../questions/questions.module.css';
import styles from './imports.module.css';

const SOURCE_TYPES = Object.entries(L.sourceType).map(([value, label]) => ({ value, label }));
const newId = () => globalThis.crypto.randomUUID();

// analyze / hash are injectable for tests (pdf.js needs a real browser).
export default function NewImportPage({ analyze = analyzePdf, hash = sha256Hex }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const coursesQ = useAsync(() => fetchCourses(), []);

  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState('original');
  const [sourceYear, setSourceYear] = useState('');
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);   // { pageCount, pageStats } once readable
  const [fileError, setFileError] = useState('');
  const [stage, setStage] = useState('idle');       // idle | checking | creating | uploading | finalizing
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const bufferRef = useRef(null);
  // One request id per (file, form open): a retry of the SAME file reuses it, so create_question_import is idempotent.
  const requestId = useRef(newId());

  async function onPickFile(e) {
    const f = e.target.files?.[0] ?? null;
    setFile(f); setAnalysis(null); setFileError(''); setSubmitError(''); bufferRef.current = null;
    requestId.current = newId();
    if (!f) return;
    const bad = checkFile(f);
    if (bad) { setFileError(t.precheck[bad]); return; }
    setStage('checking');
    try {
      const buffer = await f.arrayBuffer();
      const a = await analyze(buffer);
      const reason = checkPdfStats(a.pageCount, a.pageStats);
      if (reason) setFileError(t.precheck[reason]);
      else { bufferRef.current = buffer; setAnalysis(a); }
    } catch {
      setFileError(t.precheck.unreadable);
    }
    setStage('idle');
  }

  async function submit(e) {
    e.preventDefault();
    const next = {};
    if (!courseId) next.course = t.form.needCourse;
    if (!file || !analysis) next.file = fileError || t.form.needFile;
    if (!consent) next.consent = t.form.needConsent;
    const year = sourceYear === '' ? null : Number(sourceYear);
    if (year !== null && !(Number.isInteger(year) && year >= 1990 && year <= 2100)) next.year = t.form.badYear;
    setErrors(next); setSubmitError('');
    if (Object.keys(next).length) return;

    setStage('creating');
    const created = await createImport({ clientRequestId: requestId.current, courseId, sourceName, sourceType, sourceYear: year });
    if (created.error || !created.data?.ok) {
      setSubmitError(created.error?.code === 'P0002' ? t.submitErrors.courseNotFound : t.submitErrors.createFailed);
      setStage('idle'); return;
    }
    const importId = created.data.import_id;

    setStage('uploading');
    const path = sourcePath(user.id, importId);
    const sha = await hash(bufferRef.current);
    const up = await uploadSource(path, file);
    if (!up.ok) { setSubmitError(t.submitErrors.uploadFailed); setStage('idle'); return; }

    setStage('finalizing');
    const fin = await finalizeUpload({
      importId, storagePath: path, originalName: file.name, size: file.size, sha256: sha,
      pageCount: analysis.pageCount, pageStats: analysis.pageStats, consent,
    });
    if (fin.error) { setSubmitError(t.submitErrors.finalizeFailed); setStage('idle'); return; }
    if (fin.data?.ok === false && fin.data.reason !== 'already_uploaded') {
      setSubmitError(t.finalizeReasons[fin.data.reason] ?? t.submitErrors.finalizeFailed); setStage('idle'); return;
    }
    navigate(`/teacher/questions/import/${importId}`);
  }

  const busy = stage !== 'idle';
  const courses = (coursesQ.data ?? []).filter((c) => !c.is_archived);
  const stageLabel = { checking: t.form.checking, creating: t.form.creating, uploading: t.form.uploading, finalizing: t.form.finalizing }[stage];

  return (
    <>
      <Link to="/teacher/questions/import" className={qStyles.backLink}><ArrowRight size={16} aria-hidden="true" />{t.backToList}</Link>
      <PageHeader title={t.form.title} subtitle={t.form.subtitle} />
      {coursesQ.status === 'loading' && <LoadingState />}
      {coursesQ.status === 'error' && <ErrorState message={t.loadFailed} onRetry={coursesQ.reload} />}
      {coursesQ.status === 'ready' && (
        <form className={styles.form} onSubmit={submit} noValidate>
          <Select label={t.form.course} placeholder={t.form.coursePlaceholder} value={courseId} disabled={busy}
            options={courses.map((c) => ({ value: c.id, label: c.title }))} onChange={(e) => setCourseId(e.target.value)} />
          {errors.course && <p className={styles.fieldError} role="alert">{errors.course}</p>}

          <div className={styles.fileBox}>
            <label htmlFor="import-file" className={styles.fileLabel}>{t.form.file}</label>
            <input id="import-file" type="file" accept="application/pdf,.pdf" onChange={onPickFile} disabled={busy} />
            <p className={styles.hint}>{t.form.fileHint}</p>
            {analysis && file && <p className={styles.okLine}>{`${file.name} · ${t.pagesOf(analysis.pageCount)}`}</p>}
            {(fileError || errors.file) && <p className={styles.fieldError} role="alert">{fileError || errors.file}</p>}
          </div>

          <TextField label={t.form.sourceName} hint={t.form.sourceNameHint} value={sourceName} maxLength={200}
            onChange={(e) => setSourceName(e.target.value)} disabled={busy} />
          <div className={styles.grid2}>
            <Select label={t.form.sourceType} value={sourceType} options={SOURCE_TYPES} disabled={busy}
              onChange={(e) => setSourceType(e.target.value)} />
            <TextField label={t.form.sourceYear} type="number" inputMode="numeric" min="1990" max="2100" dir="ltr" value={sourceYear}
              error={errors.year} onChange={(e) => setSourceYear(e.target.value)} disabled={busy} />
          </div>

          <label className={styles.consent}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
            <span><ShieldCheck size={16} aria-hidden="true" /> {t.form.consent}</span>
          </label>
          {errors.consent && <p className={styles.fieldError} role="alert">{errors.consent}</p>}

          {submitError && <p className={styles.errorLine} role="alert">{submitError}</p>}
          <div className={styles.formActions}>
            <Button type="submit" loading={busy}>{stageLabel ?? t.form.submit}</Button>
            <Button variant="ghost" onClick={() => navigate('/teacher/questions/import')} disabled={busy}>{common.cancel}</Button>
          </div>
        </form>
      )}
    </>
  );
}
