import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Lightbulb, SkipForward } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import { ErrorState, LoadingState } from '../../components/ui/States';
import CodeEditor from '../../components/code/CodeEditor';
import Markdown from '../../components/markdown/Markdown';
import FeedbackForm from './FeedbackForm';
import { fetchReference, fetchReviewData } from './reviewApi';
import { useAsync } from '../../lib/useAsync';
import { errors, formatDateTime, nav, questionLabels as L, review as t } from '../../i18n/he';
import styles from './review.module.css';

const STATE_TONE = { none: 'neutral', in_progress: 'butter', pending: 'peach', pending_draft: 'lavender', reviewed: 'mint', returned: 'sky' };

// Derived state (approved Phase 4 state machine; no state column).
export function cellState(answer, subs, localDraft) {
  if (!answer) return 'none';
  if (answer.status === 'draft') return subs.length ? 'returned' : 'in_progress';
  const latest = subs[subs.length - 1];
  if (latest?.feedback?.released_at) return 'reviewed';
  return latest?.feedback || localDraft ? 'pending_draft' : 'pending';
}

export default function ReviewPage() {
  const { assignmentId } = useParams();
  const q = useAsync(() => fetchReviewData(assignmentId), [assignmentId]);
  if (q.status === 'loading') return <LoadingState />;
  if (q.status === 'error') return <ErrorState message={errors.generic} onRetry={q.reload} />;
  if (!q.data) return <ErrorState message={t.notFound}><Link to="/teacher/assignments">{nav.assignments}</Link></ErrorState>;
  // key: a reload remounts the view with fresh server data
  return <ReviewView key={q.data.submissions.length + ':' + assignmentId} data={q.data} reload={q.reload} />;
}

function initialForms(data) {
  const notes = new Map(data.notes.map((n) => [n.feedback_id, n.note_md]));
  const forms = {};
  for (const s of data.submissions) {
    const f = s.feedback;
    forms[s.id] = {
      values: {
        verdict: f?.verdict ?? '', message: f?.message_md ?? '', ret: f?.return_for_revision ?? false,
        note: f ? notes.get(f.id) ?? '' : '',
        tags: data.marks.filter((m) => m.submission_id === s.id).map((m) => m.mistake_tag_id),
      },
      server: null, saved: Boolean(f),
    };
  }
  return forms;
}

function ReviewView({ data, reload }) {
  const { assignment, questions, students } = data;
  const [params, setParams] = useSearchParams();
  // Form state per submission lives here, built at creation time (decision 36 lesson):
  // switching student/question never loses a draft or shows an older one.
  const [forms, setForms] = useState(() => initialForms(data));
  const [conflict, setConflict] = useState('');
  const [nextMsg, setNextMsg] = useState('');

  const answerOf = (sid, aqId) => data.answers.find((a) => a.student_id === sid && a.assignment_question_id === aqId);
  const subsOf = (answer) => (answer ? data.submissions.filter((s) => s.answer_id === answer.id) : []);
  const stateOf = (sid, aqId) => {
    const ans = answerOf(sid, aqId);
    const subs = subsOf(ans);
    return cellState(ans, subs, subs.length && forms[subs[subs.length - 1].id]?.saved);
  };

  // all (student, question) pairs in display order; pending first as default selection
  const pairs = students.flatMap((s) => questions.map((qq, i) => ({ sid: s.id, qi: i })));
  const isPending = (p) => ['pending', 'pending_draft'].includes(stateOf(p.sid, questions[p.qi].id));
  const firstPending = pairs.find(isPending);
  const studentId = params.get('student') ?? firstPending?.sid ?? students[0]?.id;
  const qi = Math.min(Math.max(Number(params.get('q') ?? (firstPending && firstPending.sid === studentId ? firstPending.qi + 1 : 1)) - 1, 0), Math.max(questions.length - 1, 0));
  const go = (sid, index) => { setNextMsg(''); setParams({ student: sid, q: String(index + 1) }); };

  function goNextPending() {
    const cur = pairs.findIndex((p) => p.sid === studentId && p.qi === qi);
    const ordered = [...pairs.slice(cur + 1), ...pairs.slice(0, Math.max(cur, 0))];
    const next = ordered.find(isPending);
    if (next) go(next.sid, next.qi); else setNextMsg(t.noPending);
  }

  if (assignment.status === 'draft') return <ErrorState message={t.draftAssignment}><Link to={`/teacher/assignments/${assignment.id}`}>{t.back}</Link></ErrorState>;
  if (!students.length || !questions.length) return <ErrorState message={t.noStudents}><Link to={`/teacher/assignments/${assignment.id}`}>{t.back}</Link></ErrorState>;

  const aq = questions[qi];
  const student = students.find((s) => s.id === studentId) ?? students[0];
  const answer = answerOf(student.id, aq.id);
  const subs = subsOf(answer);

  return (
    <div className={styles.page}>
      <Link to={`/teacher/assignments/${assignment.id}`} className={styles.backLink}><ChevronRight size={16} aria-hidden="true" />{t.back}</Link>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.muted}>{assignment.title} · {assignment.course?.title}</p>
        </div>
        <Button variant="secondary" icon={SkipForward} onClick={goNextPending}>{t.nextPending}</Button>
      </header>
      {nextMsg && <p className={styles.info} role="status">{nextMsg}</p>}
      {conflict && <p className={styles.warning} role="alert">{conflict}</p>}

      <nav className={styles.navBar} aria-label={t.title}>
        <div className={styles.studentSelect}>
          <Select label={t.student} value={student.id} onChange={(e) => go(e.target.value, qi)}
            options={students.map((s) => ({ value: s.id, label: s.full_name }))} />
        </div>
        <div className={styles.qChips}>
          {questions.map((x, i) => {
            const st = stateOf(student.id, x.id);
            return (
              <button key={x.id} type="button" onClick={() => go(student.id, i)} title={`${x.title} – ${t.states[st]}`}
                className={`${styles.qChip} ${i === qi ? styles.qChipOn : ''}`} data-state={st} aria-current={i === qi ? 'step' : undefined}>
                <span className={styles.qNum}>{i + 1}</span>
                <span className={styles.qState}>{t.states[st]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className={styles.grid}>
        <div className={styles.mainCol}>
          <QuestionPanel aq={aq} />
          <SubmissionPanel key={`${student.id}:${aq.id}`} aq={aq} answer={answer} subs={subs}
            reveals={data.reveals.filter((r) => r.student_id === student.id && r.assignment_question_id === aq.id)}
            studentId={student.id} forms={forms} setForms={setForms} data={data}
            onConflict={(reason) => { setConflict(`${t.conflict}${reason ? ` (${reason})` : ''}`); reload(); }} />
          <div className={styles.navRow}>
            {qi > 0 ? (
              <Button variant="secondary" icon={ChevronRight} onClick={() => go(student.id, qi - 1)}>{questions[qi - 1].title}</Button>
            ) : <span />}
            {qi < questions.length - 1 && (
              <Button variant="secondary" onClick={() => go(student.id, qi + 1)}>
                {questions[qi + 1].title}<ChevronLeft size={18} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestionPanel({ aq }) {
  const [refOpen, setRefOpen] = useState(false);
  const ref = useAsync(() => (refOpen ? fetchReference(aq.id) : Promise.resolve({ data: null, error: null })), [refOpen, aq.id]);
  return (
    <section className={styles.card} aria-labelledby="q-title">
      <details open className={styles.details}>
        <summary><span id="q-title" className={styles.cardTitle}>{t.question}: {aq.title}</span></summary>
        <div className={styles.badges}><Badge tone="sky">{L.questionType[aq.question_type]}</Badge></div>
        <Markdown>{aq.body_md}</Markdown>
      </details>
      <details className={styles.details} onToggle={(e) => setRefOpen(e.currentTarget.open)}>
        <summary><span className={styles.cardSubTitle}>{t.reference}</span></summary>
        {ref.status === 'loading' && refOpen && <LoadingState />}
        {ref.data && (
          <div className={styles.refBody}>
            {ref.data.hints.length > 0 && (
              <div>
                <p className={styles.fieldLabel}>{t.hintsTitle}</p>
                {ref.data.hints.map((h) => <div key={h.level} className={styles.hintBox}><Markdown>{h.content_md}</Markdown></div>)}
              </div>
            )}
            {!ref.data.solution && <p className={styles.muted}>{t.referenceEmpty}</p>}
            {ref.data.solution?.solution_code?.trim() && (
              <CodeEditor value={ref.data.solution.solution_code} readOnly minHeight="60px" language={aq.programming_language || 'java'} label={t.reference} />
            )}
            {ref.data.solution?.explanation_md?.trim() && <Markdown>{ref.data.solution.explanation_md}</Markdown>}
          </div>
        )}
      </details>
    </section>
  );
}

function SubmissionPanel({ aq, answer, subs, reveals, studentId, forms, setForms, data, onConflict }) {
  const [selected, setSelected] = useState(subs.length ? subs[subs.length - 1].id : null);
  const sub = subs.find((s) => s.id === selected);
  const hintReveals = reveals.filter((r) => r.kind === 'hint');
  const byTeacher = hintReveals.filter((r) => r.revealed_by !== studentId).length;
  const solution = reveals.find((r) => r.kind === 'solution');

  return (
    <div className={styles.subGrid}>
      <section className={styles.card} aria-labelledby="ans-title">
        <h2 id="ans-title" className={styles.cardTitle}>{t.answer}</h2>
        <p className={styles.revealLine}>
          {aq.hint_count > 0 && <span><Lightbulb size={15} aria-hidden="true" /> {t.hintsUsed(hintReveals.length, aq.hint_count, byTeacher)}</span>}
          {aq.has_solution && <span><Eye size={15} aria-hidden="true" /> {solution ? t.solutionSeen(formatDateTime(solution.revealed_at)) : t.solutionNotSeen}</span>}
        </p>
        {subs.length === 0 ? <p className={styles.muted}>{t.noSubmission}</p> : (
          <>
            <div className={styles.tabs} role="tablist">
              {subs.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === selected}
                  className={s.id === selected ? styles.tabOn : ''} onClick={() => setSelected(s.id)}>
                  {t.attempt(s.attempt_number)}
                </button>
              ))}
            </div>
            {sub && (
              <>
                <p className={styles.muted}>{t.submittedAt}: {formatDateTime(sub.submitted_at)}</p>
                {aq.question_type === 'code'
                  ? <CodeEditor value={sub.content} readOnly minHeight="140px" language={aq.programming_language || 'java'} label={t.answer} />
                  : <div className={styles.textAnswer}><Markdown>{sub.content}</Markdown></div>}
              </>
            )}
            {answer?.status === 'draft' && <p className={styles.info}>{t.workingOnNext(subs.length + 1)}</p>}
          </>
        )}
      </section>

      {sub && forms[sub.id] && (
        <FeedbackForm key={sub.id} submission={sub} initial={forms[sub.id].values} server={forms[sub.id].server}
          tags={data.tags} topics={data.topics} solutionSeen={Boolean(solution)}
          onChange={(values) => setForms((m) => ({ ...m, [sub.id]: { ...m[sub.id], values } }))}
          onSaved={(raw) => setForms((m) => ({ ...m, [sub.id]: { ...m[sub.id], server: raw, saved: true } }))}
          onConflict={onConflict} />
      )}
    </div>
  );
}
