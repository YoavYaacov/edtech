import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Collapsible from '../../components/ui/Collapsible';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Select from '../../components/ui/Select';
import TextField from '../../components/ui/TextField';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import Markdown from '../../components/markdown/Markdown';
import MarkdownField from '../../components/markdown/MarkdownField';
import TopicPicker from '../questions/TopicPicker';
import { courseLanguageList, fetchCourse, fetchTopics } from '../content/contentApi';
import { languages as langNames, questionLabels as L } from '../../i18n/he';
import { importReview as t, imports as it } from '../../i18n/he';
import {
  approveCandidate, fetchCandidates, fetchImport, rejectCandidate, saveCandidateDraft,
} from './importsApi';
import {
  FILTERS, applyFormChange, approvalErrorKey, cleanDraft, countByFilter, draftForm, filterCandidates, findMathErrors, flagList,
  hasMaterialFlag, isEdited, materialFlags, nextPendingId, sortCandidates,
} from './reviewModel';
import { LIMITS } from './pdfPrecheck';
import { useCandidateDraft } from './useCandidateDraft';
import qStyles from '../questions/questions.module.css';
import styles from './review.module.css';

const PdfPageView = lazy(() => import('./PdfPageView'));
const toOptions = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
const titleOf = (c) => (typeof c?.draft?.title === 'string' && c.draft.title.trim()) || t.untitled;

export default function ImportReviewPage() {
  const { importId } = useParams();
  const [params, setParams] = useSearchParams();
  const [load, setLoad] = useState({ status: 'loading' });
  const [imp, setImp] = useState(null);
  const [cands, setCands] = useState([]);
  const [course, setCourse] = useState(null);
  const [topics, setTopics] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [flash, setFlash] = useState(null);       // { text, questionId? }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);     // 'approve' | 'reject' | 'restore'
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState('write');
  const [showPdf, setShowPdf] = useState(false);

  const sorted = useMemo(() => sortCandidates(cands), [cands]);
  const counts = useMemo(() => countByFilter(sorted), [sorted]);
  const selectedId = params.get('c');
  const selected = sorted.find((c) => c.id === selectedId) ?? null;
  const visible = filterCandidates(sorted, filter);

  const select = useCallback((id) => {
    setParams((p) => { const n = new URLSearchParams(p); if (id) n.set('c', id); else n.delete('c'); return n; }, { replace: true });
    setError(''); setAck(false); setTab('write');
  }, [setParams]);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([fetchImport(importId), fetchCandidates(importId)]);
    if (a.error || b.error) { setLoad((s) => (s.status === 'ready' ? s : { status: 'error' })); return null; }
    if (!a.data || a.data.archived_at) { setLoad({ status: 'notfound' }); return null; }
    setImp(a.data); setCands(b.data ?? []); setLoad({ status: 'ready' });
    return { imp: a.data, cands: b.data ?? [] };
  }, [importId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await refresh();
      if (!alive || !r) return;
      const [c, tp] = await Promise.all([fetchCourse(r.imp.course_id), fetchTopics(r.imp.course_id)]);
      if (!alive) return;
      setCourse(c.data ?? null); setTopics(tp.data ?? []);
      if (!params.get('c')) {
        const list = sortCandidates(r.cands);
        const first = list.find((x) => x.review_status === 'pending') ?? list[0];
        if (!list.some((x) => x.review_status === 'pending')) setFilter('all');
        if (first) select(first.id);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importId]);

  // ---- draft autosave ----
  const saveFn = useCallback(async (id, draft) => {
    const { data, error: err } = await saveCandidateDraft(id, draft);
    if (err) return { error: err };
    if (data?.ok === false) { refresh(); return { ok: true }; } // already handled elsewhere: just reload the truth
    return { ok: true };
  }, [refresh]);
  const onSaved = useCallback((id, draft) => {
    setCands((list) => list.map((c) => (c.id === id ? { ...c, draft } : c)));
  }, []);
  const { draft, setDraft, status: saveStatus, flush } = useCandidateDraft({ candidate: selected, save: saveFn, onSaved });

  const pending = selected?.review_status === 'pending';
  const live = selected ? { ...selected, draft } : null;
  const form = useMemo(() => (live ? draftForm(live, course) : null), [live, course]); // eslint-disable-line react-hooks/exhaustive-deps
  const deferredBody = useDeferredValue(form?.body_md ?? '');
  const mathErrors = useMemo(() => findMathErrors(deferredBody), [deferredBody]);
  const flags = live ? flagList(live, mathErrors) : [];
  const material = live ? materialFlags(live) : [];
  const edited = live ? isEdited(live) : false;

  const change = (patch) => setDraft((d) => applyFormChange(d, patch));
  const set = (k) => (e) => change({ [k]: e.target.value });

  async function goTo(id) {
    if (!(await flush())) { setError(t.errors.unsaved); return; }
    setFlash(null); select(id);
  }

  function afterDecision(id) {
    const list = sortCandidates(cands.map((c) => (c.id === id ? { ...c, review_status: 'x' } : c)));
    const nxt = nextPendingId(list, id);
    select(nxt);
    if (!nxt) setFilter((f) => (f === 'pending' || f === 'attention' ? 'all' : f));
    return nxt;
  }

  async function doApprove(acknowledge) {
    setBusy(true); setError('');
    if (!(await flush())) { setBusy(false); setError(t.errors.unsaved); setDialog(null); return; }
    const { data, error: err } = await approveCandidate(selected.id, acknowledge);
    setBusy(false);
    if (err) { setError(t.errors[approvalErrorKey(err)]); setDialog(null); return; }
    if (data?.ok === false) {
      if (data.reason === 'ack_required') { setDialog('approve'); return; }
      setDialog(null); setError(t.errors.notPending); await refresh(); return;
    }
    const id = selected.id;
    setDialog(null); setAck(false);
    setCands((list) => list.map((c) => (c.id === id ? { ...c, review_status: 'approved', approved_question_id: data.question_id } : c)));
    setFlash({ text: data.status === 'draft' ? t.results.approvedDraft : t.results.approvedReady, questionId: data.question_id });
    afterDecision(id);
  }

  async function doReject() {
    setBusy(true); setError('');
    const { data, error: err } = await rejectCandidate(selected.id);
    setBusy(false); setDialog(null);
    if (err) { setError(t.errors.generic); return; }
    if (data?.ok === false) { setError(t.errors.notPending); await refresh(); return; }
    const id = selected.id;
    setCands((list) => list.map((c) => (c.id === id ? { ...c, review_status: 'rejected' } : c)));
    setFlash({ text: t.results.rejected });
    afterDecision(id);
  }

  function doRestore() { setDialog(null); setDraft(cleanDraft(selected.proposal)); }

  if (load.status === 'loading') return <LoadingState />;
  if (load.status === 'error') return <ErrorState message={t.errors.load} onRetry={refresh} />;
  if (load.status === 'notfound') {
    return <EmptyState title={t.errors.notFoundImport} action={<Link to="/teacher/questions/import" className={qStyles.linkButton}>{it.backToList}</Link>} />;
  }

  const file = imp.import_files?.[0] ?? null;
  const idx = selected ? sorted.findIndex((c) => c.id === selected.id) : -1;
  const langs = courseLanguageList(course);
  const langOptions = langs.map((l) => ({ value: l, label: langNames[l] ?? l }));
  const hitLimit = cands.length >= LIMITS.maxCandidates;

  return (
    <>
      <Link to={`/teacher/questions/import/${importId}`} className={qStyles.backLink}><ArrowRight size={16} aria-hidden="true" />{t.backToImport}</Link>
      <PageHeader title={imp.source_name || file?.original_name || t.title} subtitle={t.intro}
        actions={<Badge tone="lavender">{`${counts.pending} ${t.filters.pending}`}</Badge>} />

      {hitLimit && (
        <section className={`${styles.card} ${styles.warn}`} role="status">
          <h2 className={styles.cardTitle}><AlertTriangle size={18} aria-hidden="true" /> {t.limitTitle}</h2>
          <p>{t.limitBody(LIMITS.maxCandidates)}</p>
        </section>
      )}

      {flash && (
        <p className={styles.okLine} role="status">
          <CheckCircle2 size={16} aria-hidden="true" /> {flash.text}{' '}
          {flash.questionId && <Link to={`/teacher/questions/${flash.questionId}`} className={styles.inlineLink}>{t.results.openQuestion}</Link>}
        </p>
      )}

      <div className={styles.layout}>
        <nav className={styles.listPane} aria-label={t.listLabel}>
          <div className={styles.filterRow} role="group" aria-label={t.listLabel}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={`${styles.chip} ${filter === f ? styles.chipOn : ''}`} aria-pressed={filter === f}
                onClick={() => setFilter(f)}>{t.filters[f]} <span className={styles.chipCount}>{counts[f]}</span></button>
            ))}
          </div>
          {visible.length === 0 ? <p className={styles.hint}>{t.noneInFilter}</p> : (
            <ul className={styles.items}>
              {visible.map((c) => (
                <li key={c.id}>
                  <button type="button" className={`${styles.item} ${c.id === selectedId ? styles.itemOn : ''}`} aria-current={c.id === selectedId || undefined}
                    onClick={() => goTo(c.id)}>
                    <span className={styles.itemTitle}>{titleOf(c)}</span>
                    <span className={styles.itemMeta}>
                      <span>{t.pages(c.source_pages)}</span>
                      <Badge tone={c.review_status === 'approved' ? 'mint' : c.review_status === 'rejected' ? 'rose' : 'neutral'}>{t.statusBadge[c.review_status]}</Badge>
                      {c.review_status === 'pending' && hasMaterialFlag(c) && <Badge tone="butter">{t.warnings.title}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className={styles.detail}>
          {!selected && (
            <EmptyState icon={CheckCircle2} tone="mint" title={t.results.allDone}
              action={<Link to="/teacher/questions" className={qStyles.linkButton}>{t.results.backToBank}</Link>} />
          )}

          {selected && (
            <>
              <div className={styles.detailHead}>
                <strong>{t.position(idx + 1, sorted.length)}</strong>
                <span className={styles.headBtns}>
                  <Button variant="ghost" icon={ChevronRight} disabled={idx <= 0} onClick={() => goTo(sorted[idx - 1].id)}>{t.prev}</Button>
                  <Button variant="ghost" icon={ChevronLeft} disabled={idx >= sorted.length - 1} onClick={() => goTo(sorted[idx + 1].id)}>{t.next}</Button>
                </span>
              </div>

              {flags.length > 0 && selected.review_status === 'pending' && (
                <section className={`${styles.card} ${material.length ? styles.warn : ''}`} aria-label={t.warnings.title}>
                  <h2 className={styles.cardTitle}><AlertTriangle size={18} aria-hidden="true" /> {t.warnings.title}</h2>
                  <ul className={styles.flagList}>
                    {flags.map((f) => (
                      <li key={f.kind}>
                        <Badge tone={f.severity === 'material' ? 'butter' : 'neutral'}>{it.flags[f.kind] ?? f.kind}</Badge>{' '}
                        <span>{t.warnings[f.kind] ?? f.message}</span>
                        {f.kind === 'duplicate_in_bank' && selected.duplicate_of_question_id && (
                          <> <Link to={`/teacher/questions/${selected.duplicate_of_question_id}`} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>{t.warnings.openExisting}</Link>
                            {typeof selected.duplicate_score === 'number' && <span className={styles.hint}> ({t.warnings.similarity(Math.round(selected.duplicate_score * 100))})</span>}</>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {selected.review_status === 'approved' && (
                <section className={`${styles.card} ${styles.ok}`}>
                  <h2 className={styles.cardTitle}><CheckCircle2 size={18} aria-hidden="true" /> {t.approvedView.title}</h2>
                  <p>{t.approvedView.body}</p>
                  {selected.approved_question_id && <Link to={`/teacher/questions/${selected.approved_question_id}`} className={qStyles.linkButton}>{t.results.openQuestion}</Link>}
                </section>
              )}
              {selected.review_status === 'rejected' && (
                <section className={styles.card}>
                  <h2 className={styles.cardTitle}><X size={18} aria-hidden="true" /> {t.rejectedView.title}</h2>
                  <p>{t.rejectedView.body}</p>
                </section>
              )}

              <div className={styles.columns}>
                <section className={styles.card} aria-label={t.source.title}>
                  <h2 className={styles.cardTitle}>{t.source.title}</h2>
                  <p className={styles.hint}>{t.source.explain}</p>
                  <p className={styles.metaLine}>
                    <span>{t.pages(selected.source_pages)}</span>
                    {selected.source_label && <span dir="auto">{t.source.label(selected.source_label)}</span>}
                  </p>
                  <pre className={styles.sourceText} dir="auto">{selected.source_text}</pre>
                  {file?.storage_path && (
                    <>
                      <Button variant="secondary" icon={showPdf ? EyeOff : Eye} onClick={() => setShowPdf((v) => !v)}>
                        {showPdf ? t.source.hide : t.source.show}</Button>
                      {showPdf && (
                        <Suspense fallback={<p className={styles.hint} role="status">{t.source.loading}</p>}>
                          <PdfPageView path={file.storage_path} startPage={selected.source_pages[0]} pageCount={file.page_count} />
                        </Suspense>
                      )}
                    </>
                  )}
                </section>

                <section className={styles.card} aria-label={t.proposal.title}>
                  <div className={styles.cardHeadRow}>
                    <h2 className={styles.cardTitle}>{t.proposal.title}</h2>
                    <span className={styles.saveState} role="status" aria-live="polite">{pending ? t.save[saveStatus] : ''}</span>
                  </div>
                  {pending ? <p className={styles.hint}>{t.proposal.explain}</p> : null}
                  {edited && <Badge tone="lavender">{t.edited}</Badge>}

                  {pending ? (
                    <>
                      <TextField label={t.proposal.titleLabel} value={form.title} onChange={set('title')} maxLength={300} />
                      <div className={styles.grid3}>
                        <Select label={t.proposal.type} value={form.question_type} options={toOptions(L.questionType)} onChange={set('question_type')} />
                        {form.question_type !== 'text' && (
                          <Select label={t.proposal.language} value={form.programming_language} placeholder="" options={langOptions} onChange={set('programming_language')} />
                        )}
                        <Select label={t.proposal.difficulty} value={form.difficulty} options={toOptions(L.difficulty)} onChange={set('difficulty')} hint={draft.difficulty ? undefined : t.proposal.difficultyHint} />
                      </div>

                      <div className={styles.tabs} role="tablist">
                        <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? styles.tabOn : ''} onClick={() => setTab('write')}>{t.proposal.write}</button>
                        <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? styles.tabOn : ''} onClick={() => setTab('preview')}>{t.proposal.preview}</button>
                      </div>
                      {tab === 'write'
                        ? <MarkdownField label={t.proposal.body} rows={12} value={form.body_md} onChange={set('body_md')} />
                        : <div className={styles.preview}><Markdown empty={<p className={styles.hint}>{t.proposal.previewEmpty}</p>}>{form.body_md}</Markdown></div>}

                      <h3 className={styles.subTitle}>{t.proposal.topics}</h3>
                      {topics.length === 0 ? <p className={styles.hint}>{t.proposal.topicsNone}</p>
                        : <TopicPicker topics={topics} selected={form.topic_ids} onChange={(v) => change({ topic_ids: v })} storageScope="import-review" />}

                      <Collapsible title={t.proposal.manualTitle} defaultOpen={false} headingLevel={3} storageKey="import-review-manual">
                        <p className={styles.hint}>{t.proposal.manualExplain}</p>
                        <MarkdownField label={t.proposal.hint1} rows={3} value={form.hint1} onChange={set('hint1')} />
                        <MarkdownField label={t.proposal.hint2} rows={3} value={form.hint2} onChange={set('hint2')} />
                        {form.question_type !== 'text' && (
                          <label className={styles.codeLabel}>
                            <span>{t.proposal.solutionCode}</span>
                            <textarea dir="ltr" rows={6} className={styles.codeArea} value={form.solution_code} onChange={set('solution_code')} />
                          </label>
                        )}
                        <MarkdownField label={t.proposal.explanation} rows={4} value={form.explanation_md} onChange={set('explanation_md')} />
                        <MarkdownField label={t.proposal.notes} rows={3} value={form.teacher_notes} onChange={set('teacher_notes')} />
                      </Collapsible>

                      {error && <p className={styles.errorLine} role="alert">{error}</p>}
                      {!form.title.trim() && <p className={styles.hint}>{t.actions.needTitle}</p>}
                      <div className={styles.actions}>
                        <Button icon={Check} loading={busy} disabled={!form.title.trim()}
                          onClick={() => (hasMaterialFlag(selected) ? setDialog('approve') : doApprove(false))}>
                          {hasMaterialFlag(selected) ? t.actions.approveDraft : t.actions.approve}</Button>
                        <Button variant="secondary" icon={X} disabled={busy} onClick={() => setDialog('reject')}>{t.actions.reject}</Button>
                        <Button variant="ghost" icon={RotateCcw} disabled={busy || !edited} onClick={() => setDialog('restore')}>{t.proposal.restore}</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={styles.metaLine}><strong>{titleOf(selected)}</strong></p>
                      <div className={styles.preview}><Markdown>{selected.draft?.body_md ?? ''}</Markdown></div>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog open={dialog === 'approve'} title={t.approveDialog.title} body={t.approveDialog.body}
        confirmLabel={t.approveDialog.confirm} confirmDisabled={!ack} busy={busy}
        onConfirm={() => doApprove(true)} onCancel={() => { setDialog(null); setAck(false); }}>
        <ul className={styles.flagList}>{material.map((f) => <li key={f.kind}><Badge tone="butter">{it.flags[f.kind] ?? f.kind}</Badge> {t.warnings[f.kind]}</li>)}</ul>
        <label className={styles.consent}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>{t.approveDialog.ack}</span></label>
      </ConfirmDialog>
      <ConfirmDialog open={dialog === 'reject'} title={t.rejectDialog.title} body={t.rejectDialog.body} confirmLabel={t.rejectDialog.confirm}
        danger busy={busy} onConfirm={doReject} onCancel={() => setDialog(null)} />
      <ConfirmDialog open={dialog === 'restore'} title={t.proposal.restoreTitle} body={t.proposal.restoreBody}
        confirmLabel={t.proposal.restoreConfirm} onConfirm={doRestore} onCancel={() => setDialog(null)} />
    </>
  );
}
