import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Eye, Lightbulb, Pencil } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/ui/States';
import CodeEditor from '../../components/code/CodeEditor';
import Markdown from '../../components/markdown/Markdown';
import { fetchProgress } from './assignmentsApi';
import { useAsync } from '../../lib/useAsync';
import { assignmentLabels as AL, assignments as t, errors, formatDateTime, review as rv } from '../../i18n/he';
import styles from './assignments.module.css';

const icon = { none: CircleDashed, draft: Pencil, submitted: CheckCircle2 };

// Students × questions. Read-only view of student work (least privilege:
// RLS returns only answers/reveals of this teacher's assignments).
export default function ProgressPanel({ questions, students, assignmentId }) {
  const aqIds = questions.map((q) => q.id);
  const q = useAsync(() => fetchProgress(aqIds), [aqIds.join(',')]);
  const [open, setOpen] = useState(null); // { studentId, aqId }

  if (q.status === 'loading') return <section className={styles.panel}><LoadingState /></section>;
  if (q.status === 'error') return <section className={styles.panel}><ErrorState message={errors.generic} onRetry={q.reload} /></section>;

  const { answers, reveals } = q.data;
  const answerOf = (sid, aqId) => answers.find((a) => a.student_id === sid && a.assignment_question_id === aqId);
  const revealsOf = (sid, aqId) => reveals.filter((r) => r.student_id === sid && r.assignment_question_id === aqId);
  const openAnswer = open && answerOf(open.studentId, open.aqId);
  const openQ = open && questions.find((x) => x.id === open.aqId);
  const openStudent = open && students.find((s) => s.id === open.studentId);

  return (
    <section className={styles.panel} aria-labelledby="progress-title">
      <div className={styles.panelHead}>
        <h2 id="progress-title" className={styles.panelTitle}>{t.progress}</h2>
        <span className={styles.headLinks}>
          {assignmentId && <Link to={`/teacher/assignments/${assignmentId}/review`}>{rv.openReview}</Link>}
          <button type="button" className={styles.linkBtn} onClick={q.reload}>{t.refresh}</button>
        </span>
      </div>
      {answers.length === 0 && reveals.length === 0 && <p className={styles.muted}>{t.progressEmpty}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.student}</th>
              {questions.map((x, i) => <th key={x.id} scope="col" title={x.title}>{i + 1}. {x.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.full_name}</th>
                {questions.map((x) => {
                  const a = answerOf(s.id, x.id);
                  const st = !a ? 'none' : a.status;
                  const rv = revealsOf(s.id, x.id);
                  const hintsUsed = rv.filter((r) => r.kind === 'hint').length;
                  const sawSolution = rv.some((r) => r.kind === 'solution');
                  const Icon = icon[st];
                  const isOpen = open?.studentId === s.id && open?.aqId === x.id;
                  return (
                    <td key={x.id}>
                      <button type="button" className={`${styles.cell} ${isOpen ? styles.cellOpen : ''}`} data-state={st}
                        onClick={() => setOpen(isOpen ? null : { studentId: s.id, aqId: x.id })}
                        aria-label={`${t.viewAnswer}: ${s.full_name}, ${x.title}`}>
                        <span className={styles.cellStatus}><Icon size={14} aria-hidden="true" />{AL.answerStatus[st]}</span>
                        {x.hint_count > 0 && (
                          <span className={styles.cellMeta}><Lightbulb size={12} aria-hidden="true" />{t.hintsUsed(hintsUsed, x.hint_count)}</span>
                        )}
                        {sawSolution && <span className={styles.cellMeta}><Eye size={12} aria-hidden="true" />{t.solutionSeen}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className={styles.viewer}>
          <h3 className={styles.viewerTitle}>{t.answerOf(openStudent?.full_name, openQ?.title)}</h3>
          {assignmentId && openAnswer?.status === 'submitted' && (
            <Link className={styles.reviewLink}
              to={`/teacher/assignments/${assignmentId}/review?student=${open.studentId}&q=${questions.findIndex((x) => x.id === open.aqId) + 1}`}>
              {rv.reviewThis}
            </Link>
          )}
          {!openAnswer ? <p className={styles.muted}>{t.noAnswer}</p> : (
            <>
              <p className={styles.muted}>
                {openAnswer.status === 'submitted'
                  ? `${t.submittedAt}: ${formatDateTime(openAnswer.submitted_at)}`
                  : `${t.lastSaved}: ${formatDateTime(openAnswer.draft_saved_at)}`}
              </p>
              {openQ?.question_type === 'code'
                ? <CodeEditor value={openAnswer.content} readOnly minHeight="120px" label={t.viewAnswer} />
                : <div className={styles.textView}><Markdown>{openAnswer.content}</Markdown></div>}
            </>
          )}
          {revealsOf(open.studentId, open.aqId).length > 0 && (
            <p className={styles.muted}>
              {t.revealedHints}: {revealsOf(open.studentId, open.aqId)
                .map((r) => (r.kind === 'hint' ? `${r.level} (${formatDateTime(r.revealed_at)})` : `${t.solutionSeen} (${formatDateTime(r.revealed_at)})`))
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
