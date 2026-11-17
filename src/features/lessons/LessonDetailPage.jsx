import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronRight, Eye, RotateCcw } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import TopicPicker from '../questions/TopicPicker';
import LessonFrame from './LessonFrame';
import { archiveLesson, fetchBundle, fetchClassesOf, fetchLesson, publishVersion, restoreVersion, setEarlyAccess, setLessonTopics, unpublishLesson } from './lessonsApi';
import { fetchTopics } from '../content/contentApi';
import { showToast } from '../../components/ui/Toast';
import { useAsync } from '../../lib/useAsync';
import { errors, formatDate, lessons as t } from '../../i18n/he';
import styles from './lessons.module.css';

export default function LessonDetailPage() {
  const { lessonId } = useParams();
  const q = useAsync(() => fetchLesson(lessonId), [lessonId]);
  const courseId = q.data?.lesson.course_id;
  const topicsQ = useAsync(() => (courseId ? fetchTopics(courseId) : Promise.resolve({ data: [], error: null })), [courseId]);
  const classesQ = useAsync(() => (courseId ? fetchClassesOf(courseId) : Promise.resolve({ data: [], error: null })), [courseId]);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); // { versionId, html }

  useEffect(() => { if (q.data) setPicked(q.data.lesson.topics.map((x) => x.topic_id)); }, [q.data]);

  if (q.status === 'loading') return <LoadingState />;
  if (q.status === 'error') return <ErrorState message={t.loadError} onRetry={q.reload} />;
  if (!q.data) return <EmptyState title={t.notFound} action={<Link to="/teacher/lessons">{t.back}</Link>} />;
  const { lesson, versions, early } = q.data;

  async function act(fn, okMsg) {
    setBusy(true); setError('');
    const { data, error: err } = await fn();
    setBusy(false);
    if (err) { setError(errors.generic); return false; }
    if (data && data.ok === false) { setError(t.publishReasons[data.reason] ?? t.reasons[data.reason] ?? errors.generic); return false; }
    if (okMsg) showToast(okMsg);
    q.reload();
    return true;
  }
  async function togglePreview(v) {
    if (preview?.versionId === v.id) return setPreview(null);
    const { data, error: err } = await fetchBundle(v.id);
    if (err || !data) return setError(errors.generic);
    setPreview({ versionId: v.id, html: data });
  }
  const same = picked && picked.length === lesson.topics.length && picked.every((x) => lesson.topics.some((y) => y.topic_id === x));
  const noTopics = lesson.topics.length === 0;

  return (
    <>
      <Link to="/teacher/lessons" className={styles.crumbs}><ChevronRight size={16} aria-hidden="true" />{t.back}</Link>
      <PageHeader title={lesson.title} subtitle={lesson.course?.title}
        actions={lesson.is_archived
          ? <Button variant="secondary" icon={ArchiveRestore} disabled={busy} onClick={() => act(() => archiveLesson(lesson.id, false))}>{t.unarchive}</Button>
          : <Button variant="secondary" icon={Archive} disabled={busy} onClick={() => act(() => archiveLesson(lesson.id, true))}>{t.archive}</Button>} />
      {error && <p className={styles.msg} role="alert">{error}</p>}

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{t.topicsLabel}</h2>
        <p className={styles.note}>{t.topicsNote}</p>
        {topicsQ.status === 'ready' && picked && (
          <TopicPicker topics={topicsQ.data} selected={picked} onChange={setPicked} storageScope={`lesson:${lesson.id}`} />
        )}
        <div className={styles.actions}>
          <Button disabled={same || busy} onClick={() => act(() => setLessonTopics(lesson.id, picked), t.topicsSaved)}>{t.saveTopics}</Button>
        </div>
      </section>

      <section className={`${styles.card} ${styles.section}`}>
        <div className={styles.cardRow}>
          <h2 className={`${styles.sectionTitle} ${styles.grow}`}>{t.versionsTitle}</h2>
          {lesson.published_version_id && <Button variant="secondary" disabled={busy} onClick={() => act(() => unpublishLesson(lesson.id), t.unpublished)}>{t.unpublish}</Button>}
        </div>
        <p className={styles.note}>{t.restoreNote} {t.newVersionResetsProgress}</p>
        <ul className={styles.versions}>
          {versions.map((v) => {
            const live = v.id === lesson.published_version_id;
            return (
              <li key={v.id} className={styles.version}>
                <div className={styles.grow}>
                  <div className={styles.name}>{t.versionLabel(v.version_no)} {live && <Badge tone="mint">{t.currentlyPublished}</Badge>}</div>
                  <div className={styles.meta}>{formatDate(v.created_at)} · {t.size(v.size_bytes)}
                    {v.origin === 'restore' && ` · ${t.fromRestore(versions.find((x) => x.id === v.restored_from)?.version_no ?? '?')}`}</div>
                </div>
                <Button variant="ghost" icon={Eye} onClick={() => togglePreview(v)}>{preview?.versionId === v.id ? t.closePreview : t.preview}</Button>
                {!live && <Button variant="secondary" disabled={busy || lesson.is_archived || noTopics} onClick={() => act(() => publishVersion(v.id), t.published)}>{t.publish}</Button>}
                {!live && v.version_no < versions[0].version_no && (
                  <Button variant="ghost" icon={RotateCcw} disabled={busy || lesson.is_archived || noTopics} onClick={() => act(() => restoreVersion(v.id), t.restored)}>{t.restore}</Button>
                )}
              </li>
            );
          })}
        </ul>
        {noTopics && <p className={styles.note}>{t.publishReasons.no_topics}</p>}
        {preview && <div className={styles.previewBox}><LessonFrame html={preview.html} title={lesson.title} /></div>}
      </section>

      <section className={`${styles.card} ${styles.section}`}>
        <h2 className={styles.sectionTitle}>{t.availability}</h2>
        <p className={styles.note}>{t.availNote}</p>
        <h3 className={styles.sectionTitle} style={{ marginTop: 'var(--space-3)' }}>{t.earlyTitle}</h3>
        <p className={styles.note}>{t.earlyBody}</p>
        {classesQ.status === 'ready' && (classesQ.data.length === 0 ? <p className={styles.muted}>{t.noClasses}</p> : classesQ.data.map((c) => (
          <label key={c.id} className={styles.check}>
            <input type="checkbox" checked={early.includes(c.id)} disabled={busy}
              onChange={(e) => act(() => setEarlyAccess(lesson.id, c.id, e.target.checked))} /> {c.title}
          </label>
        )))}
      </section>
    </>
  );
}
