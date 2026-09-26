import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Eye, Lightbulb, Pencil } from 'lucide-react';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { fetchProgress } from './assignmentsApi';
import { useAsync } from '../../lib/useAsync';
import { assignmentLabels as AL, assignments as t, errors, review as rv } from '../../i18n/he';
import styles from './assignments.module.css';

const icon = { none: CircleDashed, draft: Pencil, submitted: CheckCircle2 };

// Compact overview + navigation only (UX fix 1, decision 72).
// Reading answers, reviewing and feedback happen on the review screen.
export default function ProgressPanel({ questions, students, assignmentId }) {
  const navigate = useNavigate();
  const aqIds = questions.map((q) => q.id);
  const q = useAsync(() => fetchProgress(aqIds), [aqIds.join(',')]);

  if (q.status === 'loading') return <section className={styles.panel}><LoadingState /></section>;
  if (q.status === 'error') return <section className={styles.panel}><ErrorState message={errors.generic} onRetry={q.reload} /></section>;

  const { answers, reveals, submittedAnswerIds } = q.data;
  const submitted = new Set(submittedAnswerIds);
  const answerOf = (sid, aqId) => answers.find((a) => a.student_id === sid && a.assignment_question_id === aqId);
  const revealsOf = (sid, aqId) => reveals.filter((r) => r.student_id === sid && r.assignment_question_id === aqId);

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
              {questions.map((x, i) => <th key={x.id} scope="col" title={x.title}>{rv.questionN(i + 1)}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <th scope="row">{s.full_name}</th>
                {questions.map((x, i) => {
                  const a = answerOf(s.id, x.id);
                  const st = !a ? 'none' : a.status;
                  const rvl = revealsOf(s.id, x.id);
                  const hintsUsed = rvl.filter((r) => r.kind === 'hint').length;
                  const sawSolution = rvl.some((r) => r.kind === 'solution');
                  const Icon = icon[st];
                  const content = (
                    <>
                      <span className={styles.cellStatus}><Icon size={14} aria-hidden="true" />{AL.answerStatus[st]}</span>
                      {x.hint_count > 0 && (
                        <span className={styles.cellMeta}><Lightbulb size={12} aria-hidden="true" />{t.hintsUsed(hintsUsed, x.hint_count)}</span>
                      )}
                      {sawSolution && <span className={styles.cellMeta}><Eye size={12} aria-hidden="true" />{t.solutionSeen}</span>}
                    </>
                  );
                  const canReview = assignmentId && a && submitted.has(a.id);
                  return (
                    <td key={x.id}>
                      {canReview ? (
                        <button type="button" className={styles.cell} data-state={st}
                          onClick={() => navigate(`/teacher/assignments/${assignmentId}/review?student=${s.id}&q=${i + 1}`)}
                          aria-label={`${rv.reviewThis}: ${s.full_name}, ${rv.questionN(i + 1)}`}>
                          {content}
                        </button>
                      ) : (
                        <div className={`${styles.cell} ${styles.cellStatic}`} data-state={st}>{content}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
