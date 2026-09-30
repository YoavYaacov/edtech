import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, FileQuestion, Library, Plus, Search, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Badge from '../../components/ui/Badge';
import CourseGroups from '../../components/ui/CourseGroups';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { courseLanguageList, fetchCourses, fetchTopics } from '../content/contentApi';
import { fetchQuestions, LIST_LIMIT } from './questionsApi';
import { useAsync } from '../../lib/useAsync';
import { buildTree, descendantIds, flattenTree } from '../../lib/topicTree';
import { difficultyTone, statusTone } from './questionTones';
import { common, errors, flash, formatDate, questionLabels as L, questions as t, languages as langNames, variants as vt } from '../../i18n/he';
import styles from './questions.module.css';

const toOptions = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
const FILTER_KEYS = ['course', 'topic', 'difficulty', 'source', 'status', 'q'];
const SEARCH_DEBOUNCE_MS = 350;

export default function QuestionBankPage() {
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? '']));
  const status = params.has('status') ? f.status : 'active';

  const coursesQ = useAsync(() => fetchCourses(), []);
  const topicsQ = useAsync(
    () => (f.course ? fetchTopics(f.course) : Promise.resolve({ data: [], error: null })), [f.course]);
  const topicList = topicsQ.data ?? [];
  const topicIds = f.topic ? descendantIds(topicList, f.topic) : [];

  const questionsQ = useAsync(
    () => fetchQuestions({ courseId: f.course, topicIds, difficulty: f.difficulty, sourceType: f.source, status, search: f.q }),
    [f.course, f.topic, topicIds.join(','), f.difficulty, f.source, status, f.q]);

  // ---- live search (decision 23) -------------------------------------
  const [searchText, setSearchText] = useState(f.q);
  const pushedQ = useRef(f.q); // last value we wrote to the URL
  useEffect(() => {
    // URL changed from outside (e.g. "clear filters", back button) → follow it.
    if (f.q !== pushedQ.current) { pushedQ.current = f.q; setSearchText(f.q); }
  }, [f.q]);
  useEffect(() => {
    const target = searchText.trim() ? searchText : '';
    if (target === pushedQ.current) return undefined;
    const timer = setTimeout(() => {
      pushedQ.current = target;
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (target) next.set('q', target); else next.delete('q');
        return next;
      }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, setParams]);

  // ---- success message after saving a question (decision 22) --------
  const location = useLocation();
  const navigate = useNavigate();
  const [flashMsg, setFlashMsg] = useState(location.state?.flash ?? '');
  useEffect(() => {
    // Drop it from history so a refresh doesn't show it again.
    if (location.state?.flash) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!flashMsg) return undefined;
    const timer = setTimeout(() => setFlashMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [flashMsg]);
  const editorState = { bankSearch: location.search };

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value === '' && key !== 'status') next.delete(key); else next.set(key, value);
    if (key === 'course') next.delete('topic');
    setParams(next, { replace: true });
  }

  const courses = coursesQ.data ?? [];
  const courseName = new Map(courses.map((c) => [c.id, c.title]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Multi-language courses only: which languages a question is available in (base + variants).
  function coverage(q) {
    const course = courseById.get(q.course_id);
    const langs = courseLanguageList(course);
    if (langs.length < 2) return null;
    if (q.is_language_neutral) return <Badge tone="sky">{vt.neutralBadge}</Badge>;
    const base = q.programming_language || course.programming_language;
    const have = new Set([base, ...(q.question_variants ?? []).map((x) => x.programming_language)]);
    return langs.map((l) => <Badge key={l} tone={have.has(l) ? 'mint' : 'butter'}>{vt.coverageBadge(langNames[l] ?? l, have.has(l))}</Badge>);
  }
  const anyFilter = FILTER_KEYS.some((k) => params.has(k));
  const list = questionsQ.data ?? [];

  if (coursesQ.status === 'ready' && courses.length === 0) {
    return (
      <>
        <PageHeader title={t.title} subtitle={t.subtitle} />
        <EmptyState icon={Library} tone="sky" title={t.needCourseTitle} body={t.needCourseBody}
          action={<Link to="/teacher/courses" className={styles.linkButton}>{t.goToCourses}</Link>} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle}
        actions={<Link to={`/teacher/questions/new${f.course ? `?course=${f.course}` : ''}`} state={editorState} className={styles.linkButton}>
          <Plus size={18} aria-hidden="true" />{t.newQuestion}</Link>} />

      {flashMsg && (
        <div className={styles.flash} role="status">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{flashMsg}</span>
          <button type="button" onClick={() => setFlashMsg('')} aria-label={flash.dismiss} title={flash.dismiss}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <section className={styles.filters} aria-label={t.title}>
        <label className={styles.searchBox}>
          <Search size={18} aria-hidden="true" />
          <input type="search" placeholder={t.search} aria-label={t.search} value={searchText}
            onChange={(e) => setSearchText(e.target.value)} />
        </label>
        <Select label={t.filterCourse} placeholder={common.all} value={f.course}
          options={courses.map((c) => ({ value: c.id, label: c.is_archived ? `${c.title} (${common.archived})` : c.title }))}
          onChange={(e) => setFilter('course', e.target.value)} />
        <div className={styles.filterWide}><Select label={t.filterTopic} placeholder={common.all} value={f.topic} disabled={!f.course}
          options={flattenTree(buildTree(topicList.filter((x) => !x.is_archived)))
            .map((x) => ({ value: x.id, label: `${'\u2003'.repeat(x.level - 1)}${x.title}` }))}
          onChange={(e) => setFilter('topic', e.target.value)} /></div>
        <Select label={t.filterDifficulty} placeholder={common.all} value={f.difficulty}
          options={toOptions(L.difficulty)} onChange={(e) => setFilter('difficulty', e.target.value)} />
        <Select label={t.filterSource} placeholder={common.all} value={f.source}
          options={toOptions(L.sourceType)} onChange={(e) => setFilter('source', e.target.value)} />
        <Select label={t.filterStatus} value={status}
          options={[{ value: 'active', label: t.activeStatuses }, ...toOptions(L.status), { value: '', label: common.all }]}
          onChange={(e) => setFilter('status', e.target.value)} />
        {anyFilter && (
          <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>{t.clearFilters}</Button>
        )}
      </section>

      {(questionsQ.status === 'loading' || coursesQ.status === 'loading') && <LoadingState />}
      {(questionsQ.status === 'error' || coursesQ.status === 'error') && (
        <ErrorState message={errors.generic} onRetry={() => { coursesQ.reload(); questionsQ.reload(); }} />
      )}
      {questionsQ.status === 'ready' && coursesQ.status === 'ready' && (
        list.length === 0 ? (
          anyFilter
            ? <EmptyState icon={Search} tone="butter" title={t.noMatchTitle} body={t.noMatchBody} />
            : <EmptyState icon={FileQuestion} title={t.emptyTitle} body={t.emptyBody}
                action={<Link to="/teacher/questions/new" state={editorState} className={styles.linkButton}>{t.newQuestion}</Link>} />
        ) : (
          <>
            <p className={styles.count}>{t.resultCount(list.length)}</p>
            <CourseGroups items={list} getId={(q) => q.course_id} getTitle={(q) => courseName.get(q.course_id)}
              scope="bank" enabled={!f.course && courses.length >= 2}>
              {(items) => (
              <ul className={styles.qList}>
                {items.map((q) => (
                  <li key={q.id}>
                    <Link to={`/teacher/questions/${q.id}`} state={editorState} className={`${styles.qRow} ${q.status === 'archived' ? styles.dim : ''}`}>
                      <span className={styles.qTitle}>{q.title}</span>
                      <span className={styles.qMeta}>
                        <Badge tone={difficultyTone[q.difficulty]}>{L.difficulty[q.difficulty]}</Badge>
                        <Badge tone="neutral">
                          {L.sourceType[q.source_type]}{q.source_year ? ` ${q.source_year}` : ''}
                        </Badge>
                        <Badge tone={statusTone[q.status]}>{L.status[q.status]}</Badge>
                      {coverage(q)}
                      </span>
                      <span className={styles.qSub}>
                        {courseName.get(q.course_id)} · {t.updated} {formatDate(q.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              )}
            </CourseGroups>
            {list.length >= LIST_LIMIT && <p className={styles.muted}>{t.limitNote(LIST_LIMIT)}</p>}
          </>
        )
      )}
    </>
  );
}
