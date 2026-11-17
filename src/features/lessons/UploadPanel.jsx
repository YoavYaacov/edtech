import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Upload, X } from 'lucide-react';
import Button from '../../components/ui/Button';
import TopicPicker from '../questions/TopicPicker';
import LessonFrame from './LessonFrame';
import { parseLessonFile } from './lessonPackage';
import { assignTopics } from './lessonFormat';
import { importVersion } from './lessonsApi';
import { lessonErrors, lessonWarnings, lessons as t } from '../../i18n/he';
import styles from './lessons.module.css';

let seq = 0;
const readyToSave = (it) => it.res?.ok && !it.saved && (it.existing || (it.courseId && it.topicIds.length > 0));

// Multi-upload: each file is parsed on its own, so one bad file never stops the others.
// courses: [{id,title,topics}], lessons: existing lessons of this teacher (matched by stable key).
export default function UploadPanel({ courses, lessons, onSaved }) {
  const [items, setItems] = useState([]);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const patch = (id, p) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...(typeof p === 'function' ? p(x) : p) } : x)));

  async function addFiles(fileList) {
    const files = Array.from(fileList ?? []);
    if (input.current) input.current.value = '';
    const fresh = files.map((f) => ({ id: ++seq, name: f.name, state: 'parsing', file: f }));
    setItems((xs) => [...xs, ...fresh]);
    for (const it of fresh) {
      let res;
      try { res = await parseLessonFile(it.file); } catch { res = { ok: false, errors: [{ code: 'parse_failed' }], warnings: [] }; }
      const existing = res.ok ? lessons.find((l) => l.lesson_key === res.lessonKey) : null;
      const a = res.ok && !existing ? assignTopics(res.manifest, courses) : null;
      patch(it.id, {
        state: 'done', res, existing, assign: a, file: null,
        courseId: existing ? existing.course_id : (a?.status === 'assigned' ? a.courseId : ''),
        topicIds: a?.status === 'assigned' ? a.topicIds : [],
      });
    }
  }

  async function save(it) {
    patch(it.id, { saving: true, error: '' });
    const r = it.res;
    const { data, error } = await importVersion({
      key: r.lessonKey, title: r.title, courseId: it.existing ? it.existing.course_id : it.courseId,
      meta: r.manifest ?? {}, hash: r.hash, html: r.html, topicIds: it.existing ? [] : it.topicIds,
    });
    if (error || !data?.ok) {
      patch(it.id, { saving: false, error: (data && t.reasons[data.reason]) || t.saveError });
      return false;
    }
    patch(it.id, { saving: false, saved: { lessonId: data.lesson_id, no: data.version_no, duplicate: data.duplicate } });
    onSaved?.();
    return true;
  }
  async function saveAll() { for (const it of items) if (readyToSave(it) && !it.saving) await save(it); }

  const readyCount = items.filter((i) => readyToSave(i)).length;

  return (
    <section aria-label={t.upload}>
      <div className={styles.drop} data-over={over}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <Upload size={28} aria-hidden="true" />
        <strong>{t.upload}</strong>
        <p className={styles.muted}>{t.uploadHint}</p>
        <input ref={input} id="lesson-files" className={styles.hidden} type="file" multiple accept=".html,.htm,.zip" onChange={(e) => addFiles(e.target.files)} />
        <Button variant="secondary" icon={Upload} onClick={() => input.current?.click()}>{t.pick}</Button>
      </div>

      {items.length > 0 && (
        <>
          <ul className={styles.list}>
            {items.map((it) => <Item key={it.id} it={it} courses={courses} patch={patch} save={save}
              remove={() => setItems((xs) => xs.filter((x) => x.id !== it.id))} />)}
          </ul>
          {readyCount > 1 && <div className={styles.actions}><Button onClick={saveAll}>{t.saveAll} ({readyCount})</Button></div>}
        </>
      )}
    </section>
  );
}

function Item({ it, courses, patch, save, remove }) {
  const r = it.res;
  const course = courses.find((c) => c.id === it.courseId);
  return (
    <li className={styles.card}>
      <div className={styles.cardRow}>
        <div className={styles.grow}>
          <div className={styles.name}>{r?.title || it.name}</div>
          <div className={styles.meta}>{it.name}{r?.size ? ` · ${t.size(r.size)}` : ''}</div>
        </div>
        <button type="button" className={styles.chip} onClick={remove} aria-label={`${t.remove}: ${it.name}`}><X size={12} /></button>
      </div>

      {it.state === 'parsing' && <p className={styles.msg}>{t.parsing}</p>}

      {r && !r.ok && (
        <>
          <p className={styles.msg} role="alert">{t.failed}</p>
          <ul className={`${styles.issues} ${styles.err}`}>
            {r.errors.map((e, i) => <li key={i}>{lessonErrors[e.code] ?? e.code}{e.detail ? ` (${e.detail})` : ''}</li>)}
          </ul>
        </>
      )}

      {r?.ok && (
        <>
          {r.warnings.length > 0 && (
            <ul className={styles.issues} aria-label={t.warnings}>
              {r.warnings.map((w, i) => <li key={i}>{lessonWarnings[w.code] ?? w.code}</li>)}
            </ul>
          )}
          {it.existing ? (
            <p className={styles.msg}>{t.newVersionOf(it.existing.title, Math.max(0, ...it.existing.versions.map((v) => v.version_no)) + 1)} {t.topicsKept}</p>
          ) : (
            <>
              <p className={styles.msg}>{it.assign?.status === 'assigned' ? t.assignedBy[it.assign.method] : `${t.manualNeeded} ${t.manualReason[it.assign?.reason] ?? ''}`}</p>
              <label className={styles.field}>
                <span>{t.subject}</span>
                <select className={styles.select} value={it.courseId} onChange={(e) => patch(it.id, { courseId: e.target.value, topicIds: [] })}>
                  <option value="">{t.pickSubject}</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              {course && (
                <div className={styles.field}>
                  <span>{t.topicsLabel}</span>
                  <TopicPicker topics={course.topics} selected={it.topicIds} onChange={(ids) => patch(it.id, { topicIds: ids })} storageScope={`upload:${it.id}`} />
                  <p className={styles.note}>{t.topicsNote}</p>
                </div>
              )}
            </>
          )}
          {it.error && <p className={styles.msg} role="alert">{it.error}</p>}
          {it.saved ? (
            <p className={styles.msg}><span className={styles.ok}>{it.saved.duplicate ? t.duplicateSaved : t.saved}</span>{' · '}
              <Link to={`/teacher/lessons/${it.saved.lessonId}`}>{t.openLesson}</Link></p>
          ) : (
            <div className={styles.actions}>
              <Button disabled={!readyToSave(it)} loading={it.saving} onClick={() => save(it)}>{t.saveDraft}</Button>
              <Button variant="secondary" icon={Eye} onClick={() => patch(it.id, (x) => ({ preview: !x.preview }))}>{it.preview ? t.closePreview : t.preview}</Button>
            </div>
          )}
          {it.preview && <div className={styles.previewBox}><LessonFrame html={r.html} title={r.title} /></div>}
        </>
      )}
    </li>
  );
}
