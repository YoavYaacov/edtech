import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronRight, Lock, Plus, RotateCcw, Send, Trash2, X, XCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Select from '../../components/ui/Select';
import TextField from '../../components/ui/TextField';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { ErrorState, LoadingState } from '../../components/ui/States';
import MarkdownField from '../../components/markdown/MarkdownField';
import ProgressPanel from './ProgressPanel';
import { statusTone } from './AssignmentsPage';
import {
  addAssignmentQuestion, addRecipient, deleteAssignment, fetchAssignment, fetchAssignmentQuestions, fetchRecipients,
  publishAssignment, removeAssignmentQuestion, removeRecipient, reorderAssignmentQuestions, setAssignmentClosed,
  unpublishAssignment, updateAssignment, updateAssignmentQuestion,
} from './assignmentsApi';
import { fetchEnrollments, fetchTopics } from '../content/contentApi';
import { buildTree, descendantIds, flattenTree } from '../../lib/topicTree';
import { fetchQuestions } from '../questions/questionsApi';
import { useAsync } from '../../lib/useAsync';
import { assignmentLabels as AL, assignments as t, common, errors, nav, questionLabels as QL, questions as qt } from '../../i18n/he';
import styles from './assignments.module.css';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (s) => (s ? new Date(s).toISOString() : null);
const toOptions = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));

export default function AssignmentPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const aQ = useAsync(() => fetchAssignment(assignmentId), [assignmentId]);
  const qQ = useAsync(() => fetchAssignmentQuestions(assignmentId), [assignmentId]);
  const rQ = useAsync(() => fetchRecipients(assignmentId), [assignmentId]);
  const courseId = aQ.data?.course_id;
  const eQ = useAsync(() => (courseId ? fetchEnrollments(courseId) : Promise.resolve({ data: [], error: null })), [courseId]);
  const [action, setAction] = useState(null); // publish | unpublish | close | delete
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ kind: '', text: '' });

  if (aQ.status === 'loading') return <LoadingState />;
  if (aQ.status === 'error') return <ErrorState message={errors.generic} onRetry={aQ.reload} />;
  if (!aQ.data) return <ErrorState message={t.notFound}><Link to="/teacher/assignments">{nav.assignments}</Link></ErrorState>;

  const a = aQ.data;
  const isDraft = a.status === 'draft';
  const reloadAll = () => { aQ.reload(); qQ.reload(); rQ.reload(); };

  async function runAction(kind = action) {
    setBusy(true);
    setMessage({ kind: '', text: '' });
    let res;
    if (kind === 'publish') res = await publishAssignment(a.id);
    else if (kind === 'unpublish') res = await unpublishAssignment(a.id);
    else if (kind === 'close') res = await setAssignmentClosed(a.id, true);
    else if (kind === 'reopen') res = await setAssignmentClosed(a.id, false);
    else if (kind === 'delete') {
      const { data, error } = await deleteAssignment(a.id);
      setBusy(false); setAction(null);
      if (error || !data?.length) return setMessage({ kind: 'error', text: errors.generic });
      return navigate('/teacher/assignments', { replace: true });
    }
    setBusy(false);
    setAction(null);
    if (res.error) return setMessage({ kind: 'error', text: errors.generic });
    if (!res.data.ok) return setMessage({ kind: 'error', text: t.reasons[res.data.reason] ?? errors.generic });
    if (kind === 'publish') setMessage({ kind: 'success', text: t.published });
    reloadAll();
  }

  const dialogs = {
    publish: { title: t.publishTitle, body: t.publishBody, label: t.publish },
    unpublish: { title: t.unpublishTitle, body: t.unpublishBody, label: t.unpublish },
    close: { title: t.closeTitle, body: t.closeBody, label: t.close },
    delete: { title: t.deleteTitle, body: t.deleteBody, label: t.deleteDraft, danger: true },
  };

  const students = (rQ.data ?? []).map((r) => r.student).filter(Boolean);

  return (
    <>
      <Link to="/teacher/assignments" className={styles.backLink}><ChevronRight size={16} aria-hidden="true" />{nav.assignments}</Link>
      <PageHeader title={a.title} subtitle={a.course?.title} />
      <div className={styles.statusBar}>
        <Badge tone={statusTone[a.status]}>{AL.status[a.status]}</Badge>
        <div className={styles.actionsRow}>
          {isDraft && <Button variant="dangerGhost" icon={Trash2} onClick={() => setAction('delete')}>{t.deleteDraft}</Button>}
          {isDraft && <Button icon={Send} title={t.lifecycleHelp.draft} onClick={() => setAction('publish')}>{t.publish}</Button>}
          {a.status === 'published' && <Button variant="ghost" icon={RotateCcw} title={t.lifecycleHelp.unpublish}
            onClick={() => setAction('unpublish')}>{t.unpublish}</Button>}
          {a.status === 'published' && <Button variant="secondary" icon={XCircle} title={t.lifecycleHelp.close}
            onClick={() => setAction('close')}>{t.close}</Button>}
          {a.status === 'closed' && <Button variant="secondary" icon={RotateCcw} loading={busy} title={t.lifecycleHelp.reopen}
            onClick={() => runAction('reopen')}>{t.reopen}</Button>}
        </div>
      </div>
      <ul className={styles.lifecycleHelp}>
        {isDraft && <li>{t.lifecycleHelp.draft}</li>}
        {a.status === 'published' && <li>{t.lifecycleHelp.close}</li>}
        {a.status === 'published' && <li>{t.lifecycleHelp.unpublish}</li>}
        {a.status === 'closed' && <li>{t.lifecycleHelp.reopen}</li>}
      </ul>
      {message.text && <p className={message.kind === 'error' ? styles.errorNote : styles.successNote} role="status">{message.text}</p>}

      <DetailsPanel assignment={a} onSaved={aQ.reload} />

      {qQ.status === 'ready' && (
        <QuestionsPanel assignment={a} items={qQ.data} onChanged={qQ.reload} />
      )}
      {qQ.status === 'error' && <ErrorState message={errors.generic} onRetry={qQ.reload} />}

      {rQ.status === 'ready' && eQ.status === 'ready' && (
        <StudentsPanel assignment={a} recipients={rQ.data} enrolled={eQ.data} onChanged={rQ.reload} />
      )}

      {!isDraft && qQ.status === 'ready' && rQ.status === 'ready' && (
        <ProgressPanel questions={qQ.data.map((x) => ({ ...x, title: x.title ?? x.question?.title }))} students={students} />
      )}

      {action && (
        <ConfirmDialog open title={dialogs[action].title} body={dialogs[action].body} danger={dialogs[action].danger}
          confirmLabel={dialogs[action].label} busy={busy} onConfirm={() => runAction(action)} onCancel={() => setAction(null)} />
      )}
    </>
  );
}

function DetailsPanel({ assignment, onSaved }) {
  const [v, setV] = useState({ title: assignment.title, due: toLocalInput(assignment.due_at), instructions: assignment.instructions_md });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ kind: '', text: '' });
  const dirty = v.title !== assignment.title || v.due !== toLocalInput(assignment.due_at) || v.instructions !== assignment.instructions_md;

  async function save(e) {
    e.preventDefault();
    if (!v.title.trim()) return setNote({ kind: 'error', text: t.titleRequired });
    setBusy(true);
    const { error } = await updateAssignment(assignment.id, {
      title: v.title.trim(), due_at: fromLocalInput(v.due), instructions_md: v.instructions,
    });
    setBusy(false);
    if (error) return setNote({ kind: 'error', text: errors.generic });
    setNote({ kind: 'success', text: t.detailsSaved });
    onSaved();
  }

  return (
    <form className={styles.panel} onSubmit={save} noValidate aria-labelledby="details-title">
      <h2 id="details-title" className={styles.panelTitle}>{t.details}</h2>
      <div className={styles.createGrid}>
        <TextField label={t.titleLabel} value={v.title} maxLength={200} onChange={(e) => setV({ ...v, title: e.target.value })} />
        <TextField label={t.dueLabel} type="datetime-local" value={v.due} dir="ltr" onChange={(e) => setV({ ...v, due: e.target.value })} />
      </div>
      <MarkdownField label={t.instructions} rows={3} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
      {note.text && <p className={note.kind === 'error' ? styles.errorNote : styles.successNote} role="status">{note.text}</p>}
      <div className={styles.actionsRow}>
        <Button type="submit" variant="secondary" loading={busy} disabled={!dirty}>{t.saveDetails}</Button>
      </div>
    </form>
  );
}

function QuestionsPanel({ assignment, items, onChanged }) {
  const isDraft = assignment.status === 'draft';
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Same filtering as the question bank (the course is fixed by the assignment).
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ topic: '', difficulty: '', source: '', status: 'active' });
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchText), 350); // live search, debounced
    return () => clearTimeout(timer);
  }, [searchText]);
  const topicsQ = useAsync(
    () => (picking ? fetchTopics(assignment.course_id) : Promise.resolve({ data: [], error: null })), [picking, assignment.course_id]);
  const topicList = topicsQ.data ?? [];
  const topicIds = f.topic ? descendantIds(topicList, f.topic) : [];
  const bank = useAsync(
    () => (picking
      ? fetchQuestions({ courseId: assignment.course_id, topicIds, difficulty: f.difficulty, sourceType: f.source, status: f.status, search })
      : Promise.resolve({ data: [], error: null })),
    [picking, search, assignment.course_id, topicIds.join(','), f.difficulty, f.source, f.status]);
  const setFilter = (key) => (e) => setF((v) => ({ ...v, [key]: e.target.value }));
  const statusOptions = [{ value: 'active', label: qt.activeStatuses },
    ...toOptions(QL.status).filter((o) => o.value !== 'archived')];

  const used = new Set(items.map((x) => x.question_id));
  const available = (bank.data ?? []).filter((q) => !used.has(q.id));

  async function run(fn) {
    setBusy(true);
    setError('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) return setError(errors.generic);
    onChanged();
  }

  const move = (i, d) => {
    const ids = items.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    return run(() => reorderAssignmentQuestions(ids, new Map(items.map((x) => [x.id, x.position]))));
  };
  const nextPos = items.reduce((m, x) => Math.max(m, x.position), 0) + 1;

  return (
    <section className={styles.panel} aria-labelledby="questions-title">
      <h2 id="questions-title" className={styles.panelTitle}>{t.questions}</h2>
      <p className={styles.muted}>{isDraft ? t.questionsDraftNote : <><Lock size={14} aria-hidden="true" /> {t.questionsFrozenNote}</>}</p>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      {items.length === 0 && <p className={styles.muted}>{t.noQuestions}</p>}
      <ol className={styles.qList}>
        {items.map((x, i) => {
          const title = isDraft ? x.question?.title : x.title;
          const hintCount = isDraft ? x.question?.question_hints?.[0]?.count ?? 0 : x.hint_count;
          const bankChanged = !isDraft && x.question && x.snapshot_at && new Date(x.question.updated_at) > new Date(x.snapshot_at);
          return (
            <li key={x.id} className={styles.qItem}>
              <div className={styles.qTop}>
                <span className={styles.qNum}>{i + 1}</span>
                <span className={styles.qTitle}>{title}</span>
                {isDraft && x.question?.status === 'draft' && <Badge tone="butter">{t.bankDraftWarning}</Badge>}
                {isDraft && (
                  <span className={styles.qActions}>
                    <button type="button" className={styles.iconBtn} disabled={busy || i === 0} onClick={() => move(i, -1)}
                      aria-label={`${common.moveUp}: ${title}`} title={common.moveUp}><ArrowUp size={17} /></button>
                    <button type="button" className={styles.iconBtn} disabled={busy || i === items.length - 1} onClick={() => move(i, 1)}
                      aria-label={`${common.moveDown}: ${title}`} title={common.moveDown}><ArrowDown size={17} /></button>
                    <button type="button" className={`${styles.iconBtn} ${styles.iconDanger}`} disabled={busy}
                      onClick={() => run(() => removeAssignmentQuestion(x.id))}
                      aria-label={`${t.remove}: ${title}`} title={t.remove}><X size={17} /></button>
                  </span>
                )}
              </div>
              {bankChanged && <p className={styles.note}>{t.bankChanged}</p>}
              <div className={styles.policies}>
                <Select label={`${t.hints} (${t.hintsCount(hintCount)})`} value={x.hint_policy} options={toOptions(AL.hintPolicy)}
                  disabled={busy || hintCount === 0} onChange={(e) => run(() => updateAssignmentQuestion(x.id, { hint_policy: e.target.value }))} />
                <Select label={t.solution} value={x.solution_policy} options={toOptions(AL.solutionPolicy)} disabled={busy}
                  onChange={(e) => run(() => updateAssignmentQuestion(x.id, { solution_policy: e.target.value }))} />
              </div>
            </li>
          );
        })}
      </ol>

      {isDraft && !picking && <Button variant="secondary" icon={Plus} onClick={() => setPicking(true)}>{t.addQuestions}</Button>}
      {isDraft && picking && (
        <div className={styles.picker}>
          <div className={styles.pickerHead}>
            <h3 className={styles.pickerTitle}>{t.pickerFiltersTitle}</h3>
            <Button variant="ghost" onClick={() => setPicking(false)}>{t.closePicker}</Button>
          </div>
          <div className={styles.pickerFilters}>
            <div className={styles.full}>
              <TextField label={t.pickerSearch} type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
            </div>
            <div className={styles.full}>
              <Select label={qt.filterTopic} placeholder={common.all} value={f.topic} onChange={setFilter('topic')}
                options={flattenTree(buildTree(topicList.filter((x) => !x.is_archived)))
                  .map((x) => ({ value: x.id, label: `${'\u2003'.repeat(x.level - 1)}${x.title}` }))} />
            </div>
            <Select label={qt.filterDifficulty} placeholder={common.all} value={f.difficulty} onChange={setFilter('difficulty')}
              options={toOptions(QL.difficulty)} />
            <Select label={qt.filterSource} placeholder={common.all} value={f.source} onChange={setFilter('source')}
              options={toOptions(QL.sourceType)} />
            <Select label={qt.filterStatus} value={f.status} onChange={setFilter('status')} options={statusOptions} />
          </div>
          {bank.status === 'loading' && <LoadingState />}
          {bank.status === 'error' && <ErrorState message={errors.generic} onRetry={bank.reload} />}
          {bank.status === 'ready' && available.length === 0 && <p className={styles.muted}>{t.pickerEmpty}</p>}
          {bank.status === 'ready' && available.length > 0 && <p className={styles.muted}>{t.pickerCount(available.length)}</p>}
          <ul className={styles.pickList}>
            {available.map((q) => (
              <li key={q.id} className={styles.pickRow}>
                <span className={styles.pickText}>
                  <span className={styles.pickTitle}>{q.title}</span>
                  <span className={styles.pickMeta}>
                    <Badge tone="sky">{QL.difficulty[q.difficulty]}</Badge>
                    <Badge>{QL.sourceType[q.source_type]}{q.source_year ? ` ${q.source_year}` : ''}</Badge>
                    {q.status === 'draft' && <Badge tone="butter">{QL.status.draft}</Badge>}
                  </span>
                </span>
                <Button variant="secondary" icon={Plus} disabled={busy}
                  onClick={() => run(() => addAssignmentQuestion(assignment.id, q.id, nextPos))}>{t.add}</Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StudentsPanel({ assignment, recipients, enrolled, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const chosen = new Set(recipients.map((r) => r.student_id));

  async function toggle(studentId) {
    setBusyId(studentId);
    setError('');
    if (chosen.has(studentId)) {
      const { data, error: err } = await removeRecipient(assignment.id, studentId);
      if (err) setError(errors.generic);
      else if (!data?.length) setError(t.cannotRemove);
    } else {
      const { error: err } = await addRecipient(assignment.id, studentId);
      if (err) setError(errors.generic);
    }
    setBusyId(null);
    onChanged();
  }

  return (
    <section className={styles.panel} aria-labelledby="students-title">
      <h2 id="students-title" className={styles.panelTitle}>{t.students}</h2>
      <p className={styles.muted}>{t.studentsExplain}</p>
      {enrolled.length === 0 && <p className={styles.muted}>{t.noEnrolled}</p>}
      <ul className={styles.studentList}>
        {enrolled.map((e) => (
          <li key={e.student_id}>
            <label className={`${styles.studentOption} ${chosen.has(e.student_id) ? styles.studentOn : ''}`}>
              <input type="checkbox" checked={chosen.has(e.student_id)} disabled={busyId === e.student_id}
                onChange={() => toggle(e.student_id)} />
              <span>{e.student?.full_name}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </section>
  );
}
