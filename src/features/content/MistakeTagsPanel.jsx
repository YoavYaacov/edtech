import { useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import TextField from '../../components/ui/TextField';
import TextArea from '../../components/ui/TextArea';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { buildTree, flattenTree } from '../../lib/topicTree';
import { createMistakeTag, deleteMistakeTag, fetchMistakeTags, updateMistakeTag } from './contentApi';
import { useAuth } from '../auth/AuthProvider';
import { useAsync } from '../../lib/useAsync';
import { common, errors, mistakeTags as t } from '../../i18n/he';
import styles from './content.module.css';

const GENERAL = '__general__';

function TagForm({ topics, initial, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [topicId, setTopicId] = useState(initial?.topic_id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // archived topics are offered only if the tag already uses one
  const options = flattenTree(buildTree(topics.filter((x) => !x.is_archived || x.id === initial?.topic_id)))
    .map((x) => ({ value: x.id, label: `${'\u2003'.repeat(x.level - 1)}${x.title}` }));

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError(t.nameRequired);
    setBusy(true);
    setError('');
    const { error: err } = await onSubmit({ name: name.trim(), topicId, description: description.trim() });
    setBusy(false);
    if (err) setError(err.code === '23505' ? t.duplicate : errors.generic);
  }

  return (
    <form className={styles.tagForm} onSubmit={submit} noValidate>
      <div className={styles.tagFormGrid}>
        <TextField label={t.name} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select label={t.topic} placeholder={t.general} value={topicId} options={options}
          onChange={(e) => setTopicId(e.target.value)} />
      </div>
      <TextArea label={t.description} rows={2} maxLength={500} value={description}
        onChange={(e) => setDescription(e.target.value)} />
      {error && <p className={styles.errorNote} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>{common.cancel}</Button>
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}

// Teacher-only controlled vocabulary of mistakes for this course.
// Students never see tags (RLS: no student policy at all).
export default function MistakeTagsPanel({ courseId, topics }) {
  const { user } = useAuth();
  const q = useAsync(() => fetchMistakeTags(courseId), [courseId]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState(null); // { tag, mode: 'delete' | 'inUse' }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tags = q.data ?? [];
  const visible = tags.filter((x) => showArchived || !x.is_archived);
  const usage = (tag) => tag.usage?.[0]?.count ?? 0;

  // groups: general first, then topics in tree order
  const topicOrder = flattenTree(buildTree(topics));
  const groups = [
    { key: GENERAL, title: t.general, items: visible.filter((x) => !x.topic_id) },
    ...topicOrder.map((tp) => ({ key: tp.id, title: tp.title, items: visible.filter((x) => x.topic_id === tp.id) })),
  ].filter((g) => g.items.length > 0);

  async function run(fn) {
    setBusy(true);
    setError('');
    const res = await fn();
    setBusy(false);
    if (!res.error) q.reload();
    return res;
  }

  async function confirmDelete() {
    const tag = dialog.tag;
    const { data, error: err } = await run(() => deleteMistakeTag(tag.id));
    if (err?.code === '23503') return setDialog({ tag, mode: 'inUse' }); // attached meanwhile
    setDialog(null);
    if (err || !data?.length) setError(errors.generic);
  }

  async function archiveFromDialog() {
    const tag = dialog.tag;
    setDialog(null);
    const { error: err } = await run(() => updateMistakeTag(tag.id, { is_archived: true }));
    if (err) setError(errors.generic);
  }

  return (
    <section className={styles.panel} aria-labelledby="tags-title">
      <div className={styles.panelHeadRow}>
        <h2 id="tags-title" className={styles.panelTitle}>{t.title}</h2>
        {!adding && q.status === 'ready' && (
          <Button variant="secondary" icon={Plus} onClick={() => { setAdding(true); setEditingId(null); }}>{t.add}</Button>
        )}
      </div>
      <p className={styles.muted}>{t.explain}</p>

      {adding && (
        <TagForm topics={topics} submitLabel={t.create} onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const res = await run(() => createMistakeTag(user.id, courseId, v));
            if (!res.error) setAdding(false);
            return res;
          }} />
      )}

      {q.status === 'loading' && <LoadingState />}
      {q.status === 'error' && <ErrorState message={errors.generic} onRetry={q.reload} />}
      {q.status === 'ready' && tags.length === 0 && !adding && (
        <EmptyState icon={Tags} tone="peach" title={t.emptyTitle} body={t.emptyBody} />
      )}
      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      {groups.map((g) => (
        <div key={g.key} className={styles.tagGroup}>
          <h3 className={styles.tagGroupTitle}>{g.title}</h3>
          <ul className={styles.tagList}>
            {g.items.map((tag) => (
              <li key={tag.id} className={`${styles.tagRow} ${tag.is_archived ? styles.dim : ''}`}>
                {editingId === tag.id ? (
                  <TagForm topics={topics} initial={tag} submitLabel={common.save} onCancel={() => setEditingId(null)}
                    onSubmit={async (v) => {
                      const res = await run(() => updateMistakeTag(tag.id,
                        { name: v.name, topic_id: v.topicId || null, description: v.description }));
                      if (!res.error) setEditingId(null);
                      return res;
                    }} />
                ) : (
                  <>
                    <div className={styles.tagText}>
                      <span className={styles.tagName}>{tag.name}</span>
                      {tag.description && <span className={styles.tagDesc}>{tag.description}</span>}
                    </div>
                    <span className={styles.tagMeta}>
                      {tag.is_archived && <Badge>{common.archived}</Badge>}
                      <Badge tone={usage(tag) ? 'sky' : 'neutral'}>{t.usage(usage(tag))}</Badge>
                    </span>
                    <span className={styles.rowActions}>
                      <button type="button" className={styles.iconBtn} title={common.edit} aria-label={`${common.edit}: ${tag.name}`}
                        disabled={busy} onClick={() => { setEditingId(tag.id); setAdding(false); }}><Pencil size={16} /></button>
                      {tag.is_archived ? (
                        <button type="button" className={styles.iconBtn} title={common.restore} aria-label={`${common.restore}: ${tag.name}`}
                          disabled={busy} onClick={() => run(() => updateMistakeTag(tag.id, { is_archived: false }))}><ArchiveRestore size={17} /></button>
                      ) : (
                        <button type="button" className={styles.iconBtn} title={common.archive} aria-label={`${common.archive}: ${tag.name}`}
                          disabled={busy} onClick={() => run(() => updateMistakeTag(tag.id, { is_archived: true }))}><Archive size={17} /></button>
                      )}
                      <button type="button" className={`${styles.iconBtn} ${styles.iconDanger}`} title={t.delete}
                        aria-label={`${t.delete}: ${tag.name}`} disabled={busy}
                        onClick={() => setDialog({ tag, mode: usage(tag) > 0 ? 'inUse' : 'delete' })}><Trash2 size={16} /></button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {tags.some((x) => x.is_archived) && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {common.showArchived}
        </label>
      )}

      {dialog?.mode === 'delete' && (
        <ConfirmDialog open danger title={t.deleteTitle(dialog.tag.name)} body={t.deleteBody}
          confirmLabel={t.delete} busy={busy} onConfirm={confirmDelete} onCancel={() => setDialog(null)} />
      )}
      {dialog?.mode === 'inUse' && (
        <ConfirmDialog open title={t.inUseTitle} body={t.inUseBody(usage(dialog.tag))}
          confirmLabel={dialog.tag.is_archived ? null : common.archive} cancelLabel={t.close}
          busy={busy} onConfirm={archiveFromDialog} onCancel={() => setDialog(null)} />
      )}
    </section>
  );
}
