import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Clock, Eye, Lightbulb, Lock, Pencil, Send } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/ui/States';
import CodeEditor from '../../components/code/CodeEditor';
import Markdown from '../../components/markdown/Markdown';
import { useAsync } from '../../lib/useAsync';
import { useAutosave } from './useAutosave';
import { fetchHints, fetchSolution, fetchWorkspace, revealHint, revealSolution, saveAnswer, submitAnswer } from './workspaceApi';
import { errors, formatDateTime, formatTime, questionLabels as L, studentFeedback as sf, verdictLabels, workspace as t } from '../../i18n/he';
import { VERDICTS } from '../review/VerdictPicker';
import styles from './workspace.module.css';

const answerState = (a) => (!a ? 'none' : a.status === 'submitted' ? 'submitted' : 'draft');

// Loads the data, then mounts the view. The view builds its state from the
// loaded data at creation time, so no render ever sees an empty answer map.
// (Root cause of the autosave bug: the map used to be filled in a useEffect
// AFTER the first render, and the editor had already initialised itself from
// the starter code.)
export default function WorkspacePage() {
  const { assignmentId } = useParams();
  const ws = useAsync(() => fetchWorkspace(assignmentId), [assignmentId]);

  if (ws.status === 'loading') return <LoadingState />;
  if (ws.status === 'error') return <ErrorState message={errors.generic} onRetry={ws.reload} />;
  if (!ws.data) return <ErrorState message={t.notFound}><Link to="/student">{t.back}</Link></ErrorState>;
  return <WorkspaceView key={assignmentId} data={ws.data} />;
}

function initialAnswers(rows) {
  const a = {};
  for (const x of rows) {
    a[x.assignment_question_id] = { content: x.content, serverContent: x.content, status: x.status, submitted_at: x.submitted_at, exists: true };
  }
  return a;
}
function groupHints(rows) {
  const h = {};
  for (const x of rows) (h[x.assignment_question_id] ??= []).push(x);
  return h;
}

function WorkspaceView({ data }) {
  const [params, setParams] = useSearchParams();
  const [answers, setAnswers] = useState(() => initialAnswers(data.answers));   // aqId → { content, serverContent, status, … }
  const [hints, setHints] = useState(() => groupHints(data.hints));             // aqId → [{ level, content_md }]
  const [solutions, setSolutions] = useState(() => Object.fromEntries(data.solutions.map((x) => [x.assignment_question_id, x])));
  // per question: number of attempts + released feedback of the latest attempt (step 4 minimum)
  const [reviews, setReviews] = useState(() => {
    const byAnswer = new Map(data.answers.map((x) => [x.id, x.assignment_question_id]));
    const m = {};
    for (const s of data.submissions ?? []) {
      const aqId = byAnswer.get(s.answer_id);
      const cur = m[aqId] ?? { attempts: 0, feedback: null };
      if (s.attempt_number >= cur.attempts) {
        const f = Array.isArray(s.feedback) ? s.feedback[0] : s.feedback;
        m[aqId] = { attempts: s.attempt_number, feedback: f?.released_at ? f : null };
      }
    }
    return m;
  });

  const { assignment, questions } = data;
  const n = questions.length;
  const index = Math.min(Math.max(Number(params.get('q') || 1), 1), Math.max(n, 1)) - 1;
  const aq = questions[index];
  const closed = assignment.status === 'closed';
  const submittedCount = questions.filter((q) => answers[q.id]?.status === 'submitted').length;
  const go = (i) => setParams({ q: String(i + 1) }, { replace: false });

  const patchAnswer = (id, patch) => setAnswers((m) => ({ ...m, [id]: { ...(m[id] ?? {}), ...patch } }));

  return (
    <div className={styles.page}>
      <Link to="/student" className={styles.backLink}><ChevronRight size={16} aria-hidden="true" />{t.back}</Link>

      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{assignment.title}</h1>
          <p className={styles.meta}>
            {assignment.course?.title}
            {assignment.due_at && <> · {formatDateTime(assignment.due_at)}</>}
          </p>
        </div>
        <div className={styles.progressBox} aria-label={t.progress(submittedCount, n)}>
          <span className={styles.progressText}>{t.progress(submittedCount, n)}</span>
          <span className={styles.progressTrack}><span className={styles.progressFill} style={{ width: `${n ? (submittedCount / n) * 100 : 0}%` }} /></span>
        </div>
      </header>

      {closed && <p className={styles.closedBanner} role="status"><Lock size={16} aria-hidden="true" />{t.closedBanner}</p>}

      {assignment.instructions_md?.trim() && (
        <details className={styles.instructions}>
          <summary>{t.instructions}</summary>
          <Markdown>{assignment.instructions_md}</Markdown>
        </details>
      )}

      <nav className={styles.stepper} aria-label={t.questionOf(index + 1, n)}>
        {questions.map((q, i) => {
          // Feedback now arrives Student × Assignment, not per question (Step 5),
          // so within the assignment the student needs a clear per-question signal
          // of which ones already have feedback to look at (decision 6) — a plain
          // 'submitted' no longer implies "nothing more to see here".
          const base = answerState(answers[q.id]);
          const st = base === 'submitted' && reviews[q.id]?.feedback ? 'reviewed' : base;
          const Icon = st === 'reviewed' ? CheckCircle2 : st === 'submitted' ? Clock : st === 'draft' ? Pencil : CircleDashed;
          return (
            <button key={q.id} type="button" onClick={() => go(i)} data-state={st}
              className={`${styles.step} ${i === index ? styles.stepCurrent : ''}`}
              aria-current={i === index ? 'step' : undefined} title={q.title}>
              <span className={styles.stepNum}>{i + 1}</span>
              <Icon size={14} aria-hidden="true" />
              <span className="visually-hidden">{q.title}{st === 'reviewed' ? ` – ${t.stepReviewed}` : ''}</span>
            </button>
          );
        })}
      </nav>

      {aq && (
        <div className={styles.grid}>
          <main className={styles.mainCol}>
            <section className={styles.card} aria-labelledby="q-title">
              <p className={styles.eyebrow}>{t.questionOf(index + 1, n)}</p>
              <h2 id="q-title" className={styles.qTitle}>{aq.title}</h2>
              <div className={styles.badges}><Badge tone="sky">{L.questionType[aq.question_type]}</Badge></div>
              <Markdown>{aq.body_md}</Markdown>
            </section>

            <AnswerEditor key={aq.id} aq={aq} answer={answers[aq.id]} closed={closed} review={reviews[aq.id]}
              onChange={(content) => patchAnswer(aq.id, { content })}
              onSaved={(content) => patchAnswer(aq.id, { serverContent: content, exists: true })}
              onSubmitted={(submitted_at) => {
                patchAnswer(aq.id, { status: 'submitted', submitted_at });
                setReviews((m) => ({ ...m, [aq.id]: { attempts: (m[aq.id]?.attempts ?? 0) + 1, feedback: null } }));
              }} />

          </main>

          <aside className={styles.sideCol}>
            <HintsPanel aq={aq} revealed={hints[aq.id] ?? []}
              onRevealed={(list) => setHints((m) => ({ ...m, [aq.id]: list }))} />
            {!solutions[aq.id] && (
              <SolutionPanel aq={aq} submitted={answers[aq.id]?.status === 'submitted'} solution={null}
                onRevealed={(sol) => setSolutions((m) => ({ ...m, [aq.id]: sol }))} />
            )}
          </aside>
        </div>
      )}

      {aq && solutions[aq.id] && (
        <SolutionPanel aq={aq} submitted solution={solutions[aq.id]} wide onRevealed={() => {}} />
      )}

      {aq && (
        <div className={styles.navRow}>
          <Button variant="secondary" icon={ChevronRight} disabled={index === 0} onClick={() => go(index - 1)}>{t.prev}</Button>
          <Button variant="secondary" disabled={index >= n - 1} onClick={() => go(index + 1)}>
            {t.next}<ChevronLeft size={18} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AnswerEditor({ aq, answer, closed, review, onChange, onSaved, onSubmitted }) {
  const submitted = answer?.status === 'submitted';
  const readOnly = submitted || closed;
  const isCode = aq.question_type === 'code';
  // A new code answer starts from the starter code; nothing is stored until the student types.
  const initial = answer?.content ?? (isCode ? aq.starter_code ?? '' : '');
  const serverValue = answer?.serverContent ?? initial;
  const [value, setValue] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { status, savedAt, flush } = useAutosave({
    value, serverValue, enabled: !readOnly,
    save: (v) => saveAnswer(aq.id, v),
    onSaved: (v) => onSaved(v),
  });

  function change(v) { setValue(v); onChange(v); setError(''); }

  async function submit() {
    setBusy(true);
    setError('');
    const saved = await flush();
    if (!saved) { setBusy(false); setConfirming(false); return setError(errors.generic); }
    const { data, error: err } = await submitAnswer(aq.id);
    setBusy(false);
    setConfirming(false);
    if (err) return setError(errors.generic);
    if (!data.ok) return setError(data.reason === 'empty' ? t.submitEmpty : errors.generic);
    onSubmitted(new Date().toISOString());
  }

  const saveText = status === 'saved' && savedAt ? t.save.saved(formatTime(savedAt)) : t.save[status] ?? '';

  return (
    <section className={styles.card} aria-labelledby="answer-title">
      <div className={styles.answerHead}>
        <h3 id="answer-title" className={styles.answerTitle}>{t.yourAnswer}</h3>
        {!readOnly && (
          <span className={styles.saveState} data-state={status} role="status" aria-live="polite">{saveText}</span>
        )}
        {submitted && answer?.submitted_at && (
          <Badge tone="mint" icon={CheckCircle2}>{t.submitted(formatDateTime(answer.submitted_at))}</Badge>
        )}
      </div>

      {review?.feedback && !submitted && (
        <p className={styles.returnedBanner} role="status">{sf.returnedBanner(review.attempts + 1)}</p>
      )}
      {review?.feedback && <FeedbackCard feedback={review.feedback} />}

      {isCode ? (
        <CodeEditor value={value} onChange={change} readOnly={readOnly} minHeight="260px"
          language={aq.programming_language || 'java'} label={t.yourAnswer} />
      ) : (
        <textarea className={styles.textAnswer} value={value} rows={10} readOnly={readOnly}
          placeholder={t.answerPlaceholder} aria-label={t.yourAnswer} onChange={(e) => change(e.target.value)} />
      )}

      {error && <p className={styles.error} role="alert">{error}</p>}

      {!readOnly && (
        <div className={styles.submitRow}>
          <Button icon={Send} onClick={() => setConfirming(true)} disabled={!value.trim() || busy}>
            {review?.attempts ? sf.resubmit(review.attempts + 1) : t.submit}
          </Button>
        </div>
      )}
      <ConfirmDialog open={confirming} title={t.submitTitle} body={t.submitBody}
        confirmLabel={busy ? t.submitting : t.submit} busy={busy}
        onConfirm={submit} onCancel={() => setConfirming(false)} />
    </section>
  );
}

// Released feedback only (RLS). Verdict as text + icon, never color alone (decision 59).
function FeedbackCard({ feedback }) {
  const Icon = VERDICTS.find((x) => x.value === feedback.verdict)?.icon;
  return (
    <div className={styles.feedbackCard} data-verdict={feedback.verdict}>
      <p className={styles.feedbackHead}>
        <strong>{sf.title}</strong>
        <span className={styles.feedbackVerdict}>
          {Icon && <Icon size={16} aria-hidden="true" />} {sf.verdict}: {verdictLabels[feedback.verdict]}
        </span>
        <span className={styles.muted}>{sf.releasedAt(formatDateTime(feedback.released_at))}</span>
      </p>
      <Markdown>{feedback.message_md}</Markdown>
    </div>
  );
}

function HintsPanel({ aq, revealed, onRevealed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (aq.hint_count === 0) return null;
  const shown = [...revealed].sort((a, b) => a.level - b.level);
  const next = shown.length + 1;

  async function reveal() {
    setBusy(true);
    setError('');
    const { data, error: err } = await revealHint(aq.id);
    if (err || !data?.ok) { setBusy(false); return setError(errors.generic); }
    const { data: list, error: e2 } = await fetchHints(aq.id);
    setBusy(false);
    if (e2) return setError(errors.generic);
    onRevealed(list);
  }

  return (
    <section className={`${styles.card} ${styles.hints}`} aria-labelledby="hints-title">
      <h3 id="hints-title" className={styles.sideTitle}><Lightbulb size={18} aria-hidden="true" />{t.hints}</h3>
      {shown.map((h) => (
        <div key={h.level} className={styles.hint}>
          <p className={styles.hintLabel}>{t.hintN(h.level)}</p>
          <Markdown>{h.content_md}</Markdown>
        </div>
      ))}
      {aq.hint_policy === 'locked' ? (
        <p className={styles.muted}><Lock size={14} aria-hidden="true" /> {t.hintsLocked}</p>
      ) : next <= aq.hint_count ? (
        <Button variant="secondary" icon={Lightbulb} loading={busy} onClick={reveal}>{t.revealHint(next, aq.hint_count)}</Button>
      ) : (
        <p className={styles.muted}>{t.allHintsShown}</p>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}

function SolutionPanel({ aq, submitted, solution, onRevealed, wide = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!aq.has_solution) return null;

  async function reveal() {
    setBusy(true);
    setError('');
    const { data, error: err } = await revealSolution(aq.id);
    if (err || !data?.ok) { setBusy(false); return setError(errors.generic); }
    const { data: rows, error: e2 } = await fetchSolution(aq.id);
    setBusy(false);
    if (e2 || !rows?.[0]) return setError(errors.generic);
    onRevealed(rows[0]);
  }

  return (
    <section className={`${styles.card} ${styles.solution} ${wide ? styles.solutionWide : ''}`} aria-labelledby="solution-title">
      <h3 id="solution-title" className={styles.sideTitle}><Eye size={18} aria-hidden="true" />{t.solution}</h3>
      {solution ? (
        <>
          {solution.solution_code?.trim() && (
            <CodeEditor value={solution.solution_code} readOnly minHeight={wide ? '160px' : '80px'}
              language={aq.programming_language || 'java'} label={t.solution} />
          )}
          {solution.explanation_md?.trim() && (
            <div><p className={styles.hintLabel}>{t.explanation}</p><Markdown>{solution.explanation_md}</Markdown></div>
          )}
        </>
      ) : aq.solution_policy === 'locked' ? (
        <p className={styles.muted}><Lock size={14} aria-hidden="true" /> {t.solutionLocked}</p>
      ) : submitted ? (
        <Button variant="secondary" icon={Eye} loading={busy} onClick={reveal}>{t.revealSolution}</Button>
      ) : (
        <p className={styles.muted}><Lock size={14} aria-hidden="true" /> {t.solutionAfterSubmit}</p>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
