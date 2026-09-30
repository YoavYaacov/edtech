import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, EyeOff, Lock, Save } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import Select from '../../components/ui/Select';
import { ErrorState, LoadingState } from '../../components/ui/States';
import CodeEditor from '../../components/code/CodeEditor';
import Markdown from '../../components/markdown/Markdown';
import MarkdownField from '../../components/markdown/MarkdownField';
import TopicPicker from './TopicPicker';
import { fetchQuestion, saveQuestion } from './questionsApi';
import VariantsPanel from './VariantsPanel';
import { courseLanguageList, fetchCourses, fetchTopics } from '../content/contentApi';
import { useAsync } from '../../lib/useAsync';
import { common, errors, flash, languages, nav, questionEditor as t, questionLabels as L, variants as vt } from '../../i18n/he';
import styles from './questions.module.css';

const toOptions = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
const one = (x) => (Array.isArray(x) ? x[0] : x) ?? null; // 1:1 embeds may come back as object or array

const EMPTY = {
  title: '', course_id: '', question_type: 'code', programming_language: '', is_language_neutral: false, difficulty: 'intermediate',
  status: 'draft', source_type: 'original', source_year: '', source_exam: '', tags: '',
  body_md: '', starter_code: '', topic_ids: [], hint1: '', hint2: '',
  solution_code: '', explanation_md: '', teacher_notes: '',
};

function fromRow(q) {
  const hints = q.question_hints ?? [];
  const sol = one(q.question_solutions);
  return {
    title: q.title, course_id: q.course_id, question_type: q.question_type,
    programming_language: q.programming_language ?? '', is_language_neutral: Boolean(q.is_language_neutral), difficulty: q.difficulty, status: q.status,
    source_type: q.source_type, source_year: q.source_year ? String(q.source_year) : '', source_exam: q.source_exam,
    tags: (q.tags ?? []).join(', '), body_md: q.body_md, starter_code: q.starter_code,
    topic_ids: (q.question_topics ?? []).map((x) => x.topic_id),
    hint1: hints.find((h) => h.level === 1)?.content_md ?? '',
    hint2: hints.find((h) => h.level === 2)?.content_md ?? '',
    solution_code: sol?.solution_code ?? '', explanation_md: sol?.explanation_md ?? '',
    teacher_notes: one(q.question_teacher_notes)?.notes_md ?? '',
  };
}

function toPayload(id, v) {
  return {
    id: id ?? null, course_id: v.course_id, title: v.title.trim(), body_md: v.body_md,
    question_type: v.question_type, programming_language: v.is_language_neutral ? null : (v.programming_language || null),
    is_language_neutral: v.is_language_neutral,
    starter_code: v.question_type === 'text' ? '' : v.starter_code,
    difficulty: v.difficulty, status: v.status, source_type: v.source_type,
    source_year: v.source_year ? Number(v.source_year) : null, source_exam: v.source_exam.trim(),
    tags: v.tags.split(',').map((x) => x.trim()).filter(Boolean),
    topic_ids: v.topic_ids,
    hints: [{ level: 1, content_md: v.hint1 }, { level: 2, content_md: v.hint2 }],
    solution: { solution_code: v.solution_code, explanation_md: v.explanation_md },
    teacher_notes: v.teacher_notes,
  };
}

export default function QuestionEditorPage() {
  const { questionId } = useParams();
  const isNew = !questionId;
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Filters of the bank page we came from, so we return to the same view.
  const bankPath = `/teacher/questions${location.state?.bankSearch ?? ''}`;

  const coursesQ = useAsync(() => fetchCourses(), []);
  const questionQ = useAsync(
    () => (isNew ? Promise.resolve({ data: null, error: null }) : fetchQuestion(questionId)), [questionId]);

  const [values, setValues] = useState(null);
  const [saved, setSaved] = useState(null); // snapshot for dirty check
  const [tab, setTab] = useState('write');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Initialize the form once data is ready.
  useEffect(() => {
    if (coursesQ.status !== 'ready' || questionQ.status !== 'ready') return;
    if (isNew) {
      const active = coursesQ.data.filter((c) => !c.is_archived);
      const pre = active.find((c) => c.id === search.get('course')) ?? active[0];
      const init = { ...EMPTY, course_id: pre?.id ?? '', programming_language: pre?.programming_language ?? '' };
      setValues(init); setSaved(init);
    } else if (questionQ.data) {
      const init = fromRow(questionQ.data);
      setValues(init); setSaved(init);
    }
  }, [coursesQ.status, questionQ.status, questionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const topicsQ = useAsync(
    () => (values?.course_id ? fetchTopics(values.course_id) : Promise.resolve({ data: [], error: null })),
    [values?.course_id]);

  const dirty = useMemo(() => values && saved && JSON.stringify(values) !== JSON.stringify(saved), [values, saved]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (coursesQ.status === 'loading' || questionQ.status === 'loading' || (!values && questionQ.data !== null)) {
    return <LoadingState />;
  }
  if (coursesQ.status === 'error' || questionQ.status === 'error') {
    return <ErrorState message={errors.generic} onRetry={() => { coursesQ.reload(); questionQ.reload(); }} />;
  }
  if (!isNew && !questionQ.data) {
    return <ErrorState message={t.notFound}><Link to="/teacher/questions">{nav.questionBank}</Link></ErrorState>;
  }
  if (!values) return <LoadingState />;

  const set = (key) => (eOrValue) => {
    const value = eOrValue?.target ? eOrValue.target.value : eOrValue;
    setNotice('');
    setValues((v) => ({ ...v, [key]: value }));
  };

  function changeCourse(e) {
    const course = coursesQ.data.find((c) => c.id === e.target.value);
    setNotice('');
    setValues((v) => ({
      ...v, course_id: e.target.value, topic_ids: [],
      programming_language: v.programming_language || course?.programming_language || '',
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!values.title.trim()) return setError(t.titleRequired);
    if (!values.course_id) return setError(t.courseRequired);
    const year = values.source_year ? Number(values.source_year) : null;
    if (year !== null && !(Number.isInteger(year) && year >= 1990 && year <= 2100)) return setError(t.yearInvalid);

    setBusy(true); setError('');
    const { data: id, error: err } = await saveQuestion(toPayload(questionId, values));
    setBusy(false);
    if (err) return setError(t.saveError);
    if (!id) return setError(t.saveError);
    // Saving ends the task (decision 22): back to the bank with a success message.
    setSaved(values);
    navigate(bankPath, { state: { flash: isNew ? flash.questionCreated : flash.questionUpdated } });
  }

  const courseOptions = coursesQ.data
    .filter((c) => !c.is_archived || c.id === values.course_id)
    .map((c) => ({ value: c.id, label: c.title }));
  const hasCode = values.question_type !== 'text';
  const course = coursesQ.data.find((c) => c.id === values.course_id);
  const courseLangs = courseLanguageList(course);
  const multi = courseLangs.length > 1;
  // A question without a language counts as the course's primary language (legacy "unclassified").
  const baseLanguage = values.programming_language || course?.programming_language || '';
  const lang = baseLanguage || 'java';

  return (
    <form onSubmit={handleSave} noValidate className={styles.editor}>
      <Link to={bankPath} className={styles.backLink}><ChevronRight size={16} aria-hidden="true" />{nav.questionBank}</Link>
      <PageHeader title={isNew ? t.newTitle : values.title || t.editTitle} />

      <section className={styles.panel} aria-labelledby="sec-details">
        <h2 id="sec-details" className={styles.panelTitle}>{t.sectionDetails}</h2>
        <TextField label={t.titleLabel} value={values.title} onChange={set('title')} maxLength={300} required />
        <div className={styles.grid3}>
          <Select label={t.course} value={values.course_id} onChange={changeCourse} options={courseOptions}
            placeholder={values.course_id ? undefined : '—'} hint={isNew ? undefined : t.courseChangeNote} />
          <Select label={t.type} value={values.question_type} onChange={set('question_type')} options={toOptions(L.questionType)} />
          <Select label={t.language} value={values.is_language_neutral ? '' : values.programming_language} onChange={set('programming_language')}
            disabled={values.is_language_neutral} options={toOptions(languages)} placeholder={common.none} />
          <Select label={t.difficulty} value={values.difficulty} onChange={set('difficulty')} options={toOptions(L.difficulty)} />
          <Select label={t.status} value={values.status} onChange={set('status')} options={toOptions(L.status)} />
          <Select label={t.source} value={values.source_type} onChange={set('source_type')} options={toOptions(L.sourceType)} />
          <TextField label={t.sourceYear} type="number" inputMode="numeric" min={1990} max={2100} dir="ltr"
            value={values.source_year} onChange={set('source_year')} />
          <TextField label={t.sourceExam} hint={t.sourceExamHint} value={values.source_exam} onChange={set('source_exam')} maxLength={200} />
          <TextField label={t.tags} hint={t.tagsHint} value={values.tags} onChange={set('tags')} />
        </div>
        {multi && (
          <label className={styles.neutralRow}>
            <input type="checkbox" checked={values.is_language_neutral}
              onChange={(e) => { setNotice(''); setValues((v) => ({ ...v, is_language_neutral: e.target.checked, programming_language: e.target.checked ? '' : v.programming_language })); }} />
            <span>{vt.neutral}<br /><span className={styles.muted}>{vt.neutralHint}</span></span>
          </label>
        )}
        {multi && !values.is_language_neutral && !values.programming_language && (
          <p className={styles.muted}>{vt.unclassifiedHint}</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="sec-content">
        <div className={styles.panelHead}>
          <h2 id="sec-content" className={styles.panelTitle}>{t.sectionContent}</h2>
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'write'} className={tab === 'write' ? styles.tabOn : ''}
              onClick={() => setTab('write')}>{t.write}</button>
            <button type="button" role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? styles.tabOn : ''}
              onClick={() => setTab('preview')}>{t.preview}</button>
          </div>
        </div>
        {tab === 'write' ? (
          <MarkdownField label={t.body} hint={t.bodyHint} rows={10} value={values.body_md} onChange={set('body_md')} />
        ) : (
          <div className={styles.preview}>
            <Markdown empty={<p className={styles.muted}>{t.previewEmpty}</p>}>{values.body_md}</Markdown>
            {hasCode && values.starter_code.trim() && (
              <CodeEditor value={values.starter_code} language={lang} readOnly minHeight="60px" label={t.starterCode} />
            )}
          </div>
        )}
        {hasCode && tab === 'write' && (
          <div className={styles.codeField}>
            <span className={styles.fieldLabel}>{t.starterCode}</span>
            <CodeEditor value={values.starter_code} onChange={set('starter_code')} language={lang} label={t.starterCode} minHeight="120px" />
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="sec-topics">
        <h2 id="sec-topics" className={styles.panelTitle}>{t.sectionTopics}</h2>
        <p className={styles.muted}>{t.topicsExplain}</p>
        {topicsQ.status === 'loading' && <LoadingState />}
        {topicsQ.status === 'error' && <ErrorState message={errors.generic} onRetry={topicsQ.reload} />}
        {topicsQ.status === 'ready' && (
          <TopicPicker topics={topicsQ.data} selected={values.topic_ids} onChange={set('topic_ids')} />
        )}
      </section>

      <section className={`${styles.panel} ${styles.secret}`} aria-labelledby="sec-hints">
        <h2 id="sec-hints" className={styles.panelTitle}><Lock size={18} aria-hidden="true" />{t.sectionHints}</h2>
        <p className={styles.muted}>{t.hintsExplain}</p>
        <div className={styles.grid2}>
          <MarkdownField label={t.hint1} rows={3} value={values.hint1} onChange={set('hint1')} />
          <MarkdownField label={t.hint2} rows={3} value={values.hint2} onChange={set('hint2')} />
        </div>
      </section>

      <section className={`${styles.panel} ${styles.secret}`} aria-labelledby="sec-solution">
        <h2 id="sec-solution" className={styles.panelTitle}><Lock size={18} aria-hidden="true" />{t.sectionSolution}</h2>
        <p className={styles.muted}>{t.solutionExplain}</p>
        {hasCode && (
          <div className={styles.codeField}>
            <span className={styles.fieldLabel}>{t.solutionCode}</span>
            <CodeEditor value={values.solution_code} onChange={set('solution_code')} language={lang} label={t.solutionCode} />
          </div>
        )}
        <MarkdownField label={t.explanation} rows={4} value={values.explanation_md} onChange={set('explanation_md')} />
      </section>

      {multi && !values.is_language_neutral && (
        isNew
          ? <p className={styles.muted}>{vt.saveFirst}</p>
          : <VariantsPanel questionId={questionId} languages={courseLangs} baseLanguage={baseLanguage}
              baseHints={[values.hint1, values.hint2]} focusLanguage={search.get('variant')} />
      )}

      <section className={`${styles.panel} ${styles.private}`} aria-labelledby="sec-notes">
        <h2 id="sec-notes" className={styles.panelTitle}><EyeOff size={18} aria-hidden="true" />{t.sectionNotes}</h2>
        <p className={styles.muted}>{t.notesExplain}</p>
        <MarkdownField rows={3} value={values.teacher_notes} onChange={set('teacher_notes')} aria-label={t.sectionNotes} />
      </section>

      <div className={styles.saveBar}>
        <span className={styles.saveState} role="status">
          {error ? <span className={styles.saveError}>{error}</span> : dirty ? t.unsaved : notice}
        </span>
        <Button type="submit" icon={Save} loading={busy} disabled={!dirty && !isNew}>
          {busy ? common.saving : t.save}
        </Button>
      </div>
    </form>
  );
}
