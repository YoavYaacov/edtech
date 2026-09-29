import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import Button from '../../components/ui/Button';
import Markdown from '../../components/markdown/Markdown';
import { getCachedAiReview, getInflightAiReview, runAiReview } from './reviewApi';
import { aiReview as t, verdictLabels } from '../../i18n/he';
import styles from './review.module.css';

// Phase 6 / Round 1B. AI PROPOSES, THE TEACHER DECIDES.
//
// This card only DISPLAYS a proposal and offers explicit "use this" actions that call the
// two callbacks it is given (which are FeedbackForm's ordinary set() — the same path the
// teacher's own typing/clicking takes). It has no access to save/release/return APIs:
// it imports only the read-only proposal helpers. Running the AI changes nothing.

export const mergeFeedbackText = (current, suggested, how) =>
  how === 'append' && current.trim() !== '' ? `${current.replace(/\s+$/, '')}\n\n${suggested}` : suggested;

const errorText = (type) => t.errors[type] ?? t.errors.fallback;

export default function AiSuggestionCard({ submissionId, verdict, message, onUseVerdict, onUseMessage }) {
  const [state, setState] = useState(() => {
    const done = getCachedAiReview(submissionId);
    if (done) return { status: 'done', data: done.result };
    return { status: getInflightAiReview(submissionId) ? 'loading' : 'idle' };
  });
  const [choosing, setChoosing] = useState(false);
  const [verdictNote, setVerdictNote] = useState('');
  const [copied, setCopied] = useState(null); // { previous, applied } — for the explicit undo
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const settle = (r) => {
    if (!alive.current) return;
    setState(r.ok ? { status: 'done', data: r.result } : { status: 'error', errorType: r.errorType });
  };

  // A request for this submission may already be running (teacher left the question and came back).
  useEffect(() => {
    const running = getInflightAiReview(submissionId);
    if (running) running.then(settle);
  }, [submissionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (state.status === 'loading') return; // no double clicks while a request is active
    setState({ status: 'loading' });
    setChoosing(false);
    setCopied(null);
    setVerdictNote('');
    settle(await runAiReview(submissionId));
  }

  const loading = state.status === 'loading';
  const d = state.status === 'done' ? state.data : null;

  function useVerdict() {
    const prev = verdict;
    onUseVerdict(d.proposedVerdict);
    setVerdictNote(prev && prev !== d.proposedVerdict
      ? t.verdictReplaced(verdictLabels[prev], verdictLabels[d.proposedVerdict])
      : t.verdictApplied(verdictLabels[d.proposedVerdict]));
  }

  function copyFeedback(how) {
    const next = mergeFeedbackText(message, d.proposedStudentFeedback, how);
    setCopied({ previous: message, applied: next });
    setChoosing(false);
    onUseMessage(next);
  }

  const mismatchYes = d && d.recommendReturn && d.proposedVerdict !== 'needs_fix';
  const mismatchNo = d && !d.recommendReturn && d.proposedVerdict === 'needs_fix';
  const showAttention = d && (d.needsAttention || d.warnings.length > 0);

  return (
    <section className={styles.aiCard} aria-labelledby="ai-title" data-testid="ai-card">
      <div className={styles.aiHead}>
        <h3 id="ai-title" className={styles.aiTitle}><Sparkles size={16} aria-hidden="true" /> {t.title}</h3>
        {d && <span className={styles.aiBadge}>{t.badge}</span>}
      </div>

      {state.status === 'idle' && <p className={styles.muted}>{t.hint}</p>}

      {(state.status === 'idle' || state.status === 'error' || loading) && (
        <div className={styles.aiRun}>
          <Button variant="secondary" icon={Sparkles} onClick={run} loading={loading} disabled={loading}>
            {state.status === 'error' ? t.retry : t.button}
          </Button>
        </div>
      )}
      {loading && <p className={styles.muted} role="status">{t.loading}</p>}

      {state.status === 'error' && (
        <div role="alert" className={styles.aiError}>
          <p>{errorText(state.errorType)}</p>
          <p className={styles.muted}>{t.manualOk}</p>
        </div>
      )}

      {d && (
        <div className={styles.aiBody}>
          {showAttention && (
            <div className={d.needsAttention ? styles.aiAttention : styles.aiNotes} role={d.needsAttention ? 'alert' : undefined}>
              <strong>
                {d.needsAttention && <AlertTriangle size={15} aria-hidden="true" />} {d.needsAttention ? t.attentionTitle : t.notesTitle}
              </strong>
              {d.warnings.length > 0
                ? <ul>{d.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                : <p>{t.attentionGeneric}</p>}
            </div>
          )}

          <div className={styles.aiRow}>
            <div>
              <span className={styles.aiLabel}>{t.proposedVerdict}</span>{' '}
              <span className={styles.aiVerdict} data-verdict={d.proposedVerdict}>{verdictLabels[d.proposedVerdict]}</span>
            </div>
            {verdict === d.proposedVerdict
              ? <span className={styles.muted}>{t.verdictSelected}</span>
              : <Button variant="secondary" onClick={useVerdict}>{t.useVerdict}</Button>}
          </div>
          {d.proposedVerdict === 'needs_fix' && verdict !== 'needs_fix' && <p className={styles.muted}>{t.needsFixNote}</p>}
          {verdictNote && <p className={styles.muted} role="status">{verdictNote}</p>}

          <div className={styles.aiSection}>
            <span className={styles.aiLabel}>{t.analysis}</span>
            <Markdown empty={null}>{d.teacherAnalysis}</Markdown>
          </div>

          <div className={styles.aiSection}>
            <span className={styles.aiLabel}>{t.studentFeedback}</span>
            <div className={styles.aiQuote}><Markdown empty={null}>{d.proposedStudentFeedback}</Markdown></div>
            {!choosing && (
              <div className={styles.aiRun}>
                <Button variant="secondary" onClick={() => (message.trim() === '' ? copyFeedback('replace') : setChoosing(true))}>
                  {t.useFeedback}
                </Button>
                {copied && message === copied.applied && (
                  <button type="button" className={styles.linkBtn} onClick={() => { onUseMessage(copied.previous); setCopied(null); }}>{t.undo}</button>
                )}
              </div>
            )}
            {choosing && (
              <div className={styles.aiChoice} role="group" aria-label={t.existingTextTitle}>
                <p>{t.existingTextTitle}</p>
                <div className={styles.aiRun}>
                  <Button variant="secondary" onClick={() => copyFeedback('replace')}>{t.replaceText}</Button>
                  <Button variant="secondary" onClick={() => copyFeedback('append')}>{t.appendText}</Button>
                  <button type="button" className={styles.linkBtn} onClick={() => setChoosing(false)}>{t.cancel}</button>
                </div>
              </div>
            )}
            {copied && message === copied.applied && <p className={styles.muted} role="status">{t.feedbackCopied}</p>}
          </div>

          <div className={styles.aiSection}>
            <span className={styles.aiLabel}>{d.recommendReturn ? t.recommendYes : t.recommendNo}</span>
            {d.returnReason.trim() !== '' && <p>{d.returnReason}</p>}
            <p className={styles.muted}>{t.recommendNote}</p>
            {mismatchYes && <p className={styles.muted}>{t.recommendMismatchYes}</p>}
            {mismatchNo && <p className={styles.muted}>{t.recommendMismatchNo}</p>}
          </div>

          <div className={styles.aiRun}>
            <button type="button" className={styles.linkBtn} onClick={run}>{t.buttonAgain}</button>
          </div>
        </div>
      )}
    </section>
  );
}
