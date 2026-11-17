import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Pin, PinOff, Pencil, Trash2, BookOpen, ClipboardList } from 'lucide-react';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TextArea from '../../components/ui/TextArea';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAsync } from '../../lib/useAsync';
import {
  addComment, createPost, deleteComment, deletePost, listComments, listPosts, setPostFlags, updatePost,
} from './classesApi';
import { board as t, errors, formatDate } from '../../i18n/he';
import styles from '../content/content.module.css';

const MODES = ['off', 'open', 'locked'];
const EMPTY = { body: '', pinned: false, commentsMode: 'off', lessonId: '', assignmentId: '' };

function PostForm({ initial = EMPTY, linkables, submitLabel, busy, error, onSubmit, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form className={styles.postCard} onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
      <TextArea label={t.body} rows={4} maxLength={4000} value={f.body} onChange={set('body')} />
      <div className={styles.postActions}>
        <label className={styles.muted}>{t.linkLesson}{' '}
          <select className={styles.statusSelect} value={f.lessonId} onChange={set('lessonId')}>
            <option value="">{t.noLink}</option>
            {(linkables?.lessons ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </label>
        <label className={styles.muted}>{t.linkAssignment}{' '}
          <select className={styles.statusSelect} value={f.assignmentId} onChange={set('assignmentId')}>
            <option value="">{t.noLink}</option>
            {(linkables?.assignments ?? []).map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </label>
        <label className={styles.muted}>{t.commentsMode}{' '}
          <select className={styles.statusSelect} value={f.commentsMode} onChange={set('commentsMode')}>
            {MODES.map((m) => <option key={m} value={m}>{t.modes[m]}</option>)}
          </select>
        </label>
        <label className={styles.muted}>
          <input type="checkbox" checked={f.pinned} onChange={(e) => setF((p) => ({ ...p, pinned: e.target.checked }))} /> {t.pinned}
        </label>
      </div>
      <p className={styles.muted}>{t.modeHint}</p>
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      <div className={styles.postActions}>
        <Button type="submit" loading={busy} disabled={!f.body.trim()}>{submitLabel}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t.cancel}</Button>}
      </div>
    </form>
  );
}

function Comments({ post, isTeacher, onCount }) {
  const list = useAsync(() => listComments(post.id), [post.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canWrite = isTeacher ? post.comments_mode !== 'off' : post.comments_mode === 'open';

  async function send(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { data, error: err } = await addComment(post.id, text);
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    if (!data?.ok) { setError(t.errors[data?.reason] ?? errors.generic); return; }
    setText(''); await list.reload(); onCount();
  }
  async function remove(id) {
    const { error: err } = await deleteComment(id);
    if (err) { setError(errors.generic); return; }
    await list.reload(); onCount();
  }

  if (list.status === 'loading') return <LoadingState />;
  if (list.status === 'error') return <ErrorState message={errors.generic} onRetry={list.reload} />;
  return (
    <div>
      <ul className={styles.commentList}>
        {list.data.map((c) => (
          <li key={c.id} className={styles.commentItem}>
            <strong>{c.author_name}</strong>
            <span className={styles.commentBody}>{c.body}</span>
            {c.can_delete && (
              <button type="button" className={styles.iconBtn} title={t.deleteComment} aria-label={`${t.deleteComment}: ${c.author_name}`}
                onClick={() => remove(c.id)}><Trash2 size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {!canWrite && <p className={styles.muted}>{post.comments_mode === 'locked' ? t.commentsLocked : t.commentsOff}</p>}
      {canWrite && (
        <form className={styles.inlineForm} onSubmit={send}>
          <input className={styles.inlineInput} value={text} maxLength={1000} aria-label={t.addComment} placeholder={t.addComment}
            onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="secondary" loading={busy} disabled={!text.trim()}>{t.sendComment}</Button>
        </form>
      )}
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
    </div>
  );
}

function PostCard({ post, isTeacher, linkables, lessonHref, assignmentHref, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(f) {
    setBusy(true); setError('');
    const { data, error: err } = await updatePost(post.id, f);
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    if (!data?.ok) { setError(t.errors[data?.reason] ?? errors.generic); return; }
    setEditing(false); onChanged();
  }
  async function flags(pinned, mode) {
    const { error: err } = await setPostFlags(post.id, pinned, mode);
    if (err) onError(); else onChanged();
  }
  async function remove() {
    setBusy(true);
    const { error: err } = await deletePost(post.id);
    setBusy(false); setConfirmDel(false);
    if (err) onError(); else onChanged();
  }

  if (editing) {
    return (
      <li>
        <PostForm initial={{ body: post.body, pinned: post.pinned, commentsMode: post.comments_mode,
          lessonId: post.lesson?.id ?? '', assignmentId: post.assignment?.id ?? '' }}
        linkables={linkables} submitLabel={t.saveEdit} busy={busy} error={error} onSubmit={save} onCancel={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className={`${styles.postCard} ${post.pinned ? styles.postPinned : ''}`}>
      <div className={styles.postMeta}>
        {post.pinned && <span><Pin size={14} aria-hidden="true" /> {t.pinned}</span>}
        <span>{post.author_name}</span><span>{formatDate(post.created_at)}</span>
        {post.edited_at && <span>({t.edited})</span>}
      </div>
      <p className={styles.postBody}>{post.body}</p>
      {(post.lesson || post.assignment) && (
        <div className={styles.postActions}>
          {post.lesson && <Link to={lessonHref(post.lesson.id)}><BookOpen size={14} aria-hidden="true" /> {t.lessonLabel}: {post.lesson.title}</Link>}
          {post.assignment && <Link to={assignmentHref(post.assignment.id)}><ClipboardList size={14} aria-hidden="true" /> {t.assignmentLabel}: {post.assignment.title}</Link>}
        </div>
      )}
      <div className={styles.postActions}>
        {(post.comments_mode !== 'off' || post.comment_count > 0 || isTeacher) && (
          <button type="button" className={styles.linkBtn} aria-expanded={showComments} onClick={() => setShowComments((s) => !s)}>
            <MessageCircle size={14} aria-hidden="true" /> {showComments ? t.hideComments : t.showComments} · {t.comments(post.comment_count)}
          </button>
        )}
        {isTeacher && (
          <>
            <button type="button" className={styles.iconBtn} title={post.pinned ? t.unpin : t.pin} aria-label={`${post.pinned ? t.unpin : t.pin}`}
              onClick={() => flags(!post.pinned, post.comments_mode)}>{post.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>
            <select className={styles.statusSelect} aria-label={t.commentsMode} value={post.comments_mode}
              onChange={(e) => flags(post.pinned, e.target.value)}>
              {MODES.map((m) => <option key={m} value={m}>{`${t.commentsMode}: ${t.modes[m]}`}</option>)}
            </select>
            <button type="button" className={styles.iconBtn} title={t.edit} aria-label={t.edit} onClick={() => setEditing(true)}><Pencil size={16} /></button>
            <button type="button" className={styles.iconBtn} title={t.remove} aria-label={t.remove} onClick={() => setConfirmDel(true)}><Trash2 size={16} /></button>
          </>
        )}
      </div>
      {showComments && <Comments post={post} isTeacher={isTeacher} onCount={onChanged} />}
      <ConfirmDialog open={confirmDel} danger busy={busy} title={t.deletePostTitle} body={t.deletePostBody}
        confirmLabel={t.deletePostConfirm} onCancel={() => setConfirmDel(false)} onConfirm={remove} />
    </li>
  );
}

// One class board. The database decides what the caller may see; isTeacher only chooses which controls to draw.
export default function ClassBoard({ classId, isTeacher = false, linkables = null, lessonHref, assignmentHref }) {
  const posts = useAsync(() => listPosts(classId), [classId]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function publish(f) {
    setBusy(true); setError('');
    const { data, error: err } = await createPost(classId, f);
    setBusy(false);
    if (err) { setError(errors.generic); return; }
    if (!data?.ok) { setError(t.errors[data?.reason] ?? errors.generic); return; }
    setCreating(false); await posts.reload();
  }

  if (posts.status === 'loading') return <LoadingState />;
  if (posts.status === 'error') return <ErrorState message={errors.generic} onRetry={posts.reload} />;
  return (
    <div>
      {isTeacher && (creating
        ? <PostForm linkables={linkables} submitLabel={t.publish} busy={busy} error={error} onSubmit={publish} onCancel={() => setCreating(false)} />
        : <Button onClick={() => setCreating(true)}>{t.newPost}</Button>)}
      {posts.data.length === 0
        ? <EmptyState title={t.empty} />
        : (
          <ul className={styles.postList}>
            {posts.data.map((p) => (
              <PostCard key={p.id} post={p} isTeacher={isTeacher} linkables={linkables} lessonHref={lessonHref}
                assignmentHref={assignmentHref} onChanged={posts.reload} onError={() => setError(errors.generic)} />
            ))}
          </ul>
        )}
      {!creating && error && <p className={styles.errorNote} role="alert">{error}</p>}
    </div>
  );
}
