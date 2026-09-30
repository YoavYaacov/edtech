import { useState } from 'react';
import { ChevronDown, ArrowDown, ArrowUp, Archive, ArchiveRestore, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/States';
import Collapsible from '../../components/ui/Collapsible';
import { readOpen, writeOpen } from '../../lib/useCollapsed';
import { buildTree, nextPosition } from '../../lib/topicTree';
import { createTopic, deleteTopic, reorderSiblings, updateTopic } from './contentApi';
import { blockedReason, useSafeDelete } from './useSafeDelete';
import { common, errors, safeDelete as sd, topics as t } from '../../i18n/he';
import styles from './content.module.css';

const MAX_LEVEL = 3;
const levelTone = { 1: 'lavender', 2: 'sky', 3: 'mint' };

function InlineInput({ initial = '', placeholder, submitLabel, onSubmit, onCancel, autoFocus = false }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    const ok = await onSubmit(value.trim());
    setBusy(false);
    if (ok) setValue('');
  }
  return (
    <form className={styles.inlineForm} onSubmit={submit}>
      <input className={styles.inlineInput} value={value} placeholder={placeholder} maxLength={200}
        aria-label={placeholder} autoFocus={autoFocus} onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel?.()} />
      <Button type="submit" variant="secondary" loading={busy} disabled={!value.trim()}>{submitLabel}</Button>
      {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>{common.cancel}</Button>}
    </form>
  );
}

export default function TopicTree({ courseId, topics, onChanged }) {
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [addingUnder, setAddingUnder] = useState(null); // topic id
  const [confirm, setConfirm] = useState(null); // topic to archive
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, bump] = useState(0);
  const del = useSafeDelete({
    check: (id) => deleteTopic(id, { dryRun: true }),
    remove: (id) => deleteTopic(id, { dryRun: false }),
    onDeleted: () => onChanged(),
  });

  const visibleTopics = topics.filter((x) => showArchived || !x.is_archived);
  const tree = buildTree(visibleTopics);
  const hasArchived = topics.some((x) => x.is_archived);

  async function run(fn) {
    setError('');
    const { error: err } = await fn();
    if (err) { setError(errors.generic); return false; }
    await onChanged();
    return true;
  }

  const add = (parentId) => (title) =>
    run(() => createTopic({ courseId, parentId, title, position: nextPosition(topics, parentId) }))
      .then((ok) => { if (ok && parentId) setAddingUnder(null); return ok; });

  const rename = (id) => (title) => run(() => updateTopic(id, { title })).then((ok) => { if (ok) setEditingId(null); return ok; });

  async function move(node, siblings, delta) {
    const ids = siblings.map((s) => s.id);
    const i = ids.indexOf(node.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setBusy(true);
    await run(() => reorderSiblings(ids, new Map(siblings.map((s) => [s.id, s.position]))));
    setBusy(false);
  }

  async function setArchived(node, value) {
    setBusy(true);
    await run(() => updateTopic(node.id, { is_archived: value }));
    setBusy(false);
    setConfirm(null);
  }

  // Session-only open state per node. Default: a single sibling is open; with several, only the first.
  const nodeKey = (id) => `course:${courseId}:topic:${id}`;
  const isOpen = (id, fallback) => readOpen(nodeKey(id), fallback);
  const setOpen = (id, value) => { writeOpen(nodeKey(id), value); bump((n) => n + 1); };

  function renderList(nodes, level) {
    return (
      <ul className={styles.tree} data-level={level}>
        {nodes.map((node, index) => {
          const hasKids = node.children.length > 0;
          const open = !hasKids || isOpen(node.id, nodes.length === 1 || index === 0) || addingUnder === node.id;
          const branchId = `branch-${node.id}`;
          return (
          <li key={node.id}>
            <div className={`${styles.topicRow} ${node.is_archived ? styles.dim : ''}`}>
              {hasKids ? (
                <button type="button" className={styles.treeToggle} aria-expanded={open} aria-controls={branchId}
                  aria-label={`${open ? t.collapse : t.expand}: ${node.title}`}
                  onClick={() => setOpen(node.id, !open)}><ChevronDown size={18} aria-hidden="true" /></button>
              ) : <span className={styles.treeSpacer} aria-hidden="true" />}
              <Badge tone={levelTone[level]}>{t.levels[level]}</Badge>
              {editingId === node.id ? (
                <InlineInput autoFocus initial={node.title} placeholder={t.rename} submitLabel={common.save}
                  onSubmit={rename(node.id)} onCancel={() => setEditingId(null)} />
              ) : (
                <span className={styles.topicTitle}>{node.title}</span>
              )}
              {node.is_archived && <Badge>{common.archived}</Badge>}
              {editingId !== node.id && (
                <span className={styles.rowActions}>
                  <button type="button" className={styles.iconBtn} title={common.moveUp} aria-label={`${common.moveUp}: ${node.title}`}
                    disabled={busy || index === 0} onClick={() => move(node, nodes, -1)}><ArrowUp size={17} /></button>
                  <button type="button" className={styles.iconBtn} title={common.moveDown} aria-label={`${common.moveDown}: ${node.title}`}
                    disabled={busy || index === nodes.length - 1} onClick={() => move(node, nodes, 1)}><ArrowDown size={17} /></button>
                  {level < MAX_LEVEL && !node.is_archived && (
                    <button type="button" className={styles.iconBtn} title={t.addChild(level)} aria-label={`${t.addChild(level)}: ${node.title}`}
                      onClick={() => { setOpen(node.id, true); setAddingUnder(node.id); }}><Plus size={17} /></button>
                  )}
                  <button type="button" className={styles.iconBtn} title={t.rename} aria-label={`${t.rename}: ${node.title}`}
                    onClick={() => setEditingId(node.id)}><Pencil size={16} /></button>
                  {node.is_archived ? (
                    <button type="button" className={styles.iconBtn} title={common.restore} aria-label={`${common.restore}: ${node.title}`}
                      disabled={busy} onClick={() => setArchived(node, false)}><ArchiveRestore size={17} /></button>
                  ) : (
                    <button type="button" className={styles.iconBtn} title={common.archive} aria-label={`${common.archive}: ${node.title}`}
                      disabled={busy} onClick={() => setConfirm(node)}><Archive size={17} /></button>
                  )}
                  <button type="button" className={`${styles.iconBtn} ${styles.iconDanger}`} title={sd.deleteForever}
                    aria-label={`${sd.deleteForever}: ${node.title}`} disabled={busy || del.busy}
                    onClick={() => del.start(node)}><Trash2 size={16} /></button>
                </span>
              )}
            </div>
            {addingUnder === node.id && (
              <div className={styles.childAdd}>
                <InlineInput autoFocus placeholder={t.newChildPlaceholder(level)} submitLabel={common.add}
                  onSubmit={add(node.id)} onCancel={() => setAddingUnder(null)} />
              </div>
            )}
            {hasKids && (
              <div id={branchId} className={styles.branch} data-open={open} inert={!open || undefined}>
                <div className={styles.branchInner}>{renderList(node.children, level + 1)}</div>
              </div>
            )}
          </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Collapsible title={t.title} headingLevel={2} className={styles.panelCollapsible}
      storageKey={`course:${courseId}:topics`} defaultOpen>
      <p className={styles.muted}>{t.explain}</p>
      {(error || del.error) && <p className={styles.errorNote} role="alert">{error || del.error}</p>}
      <div className={styles.treeArea}>
        {tree.length === 0 ? (
          <EmptyState icon={FolderTree} tone="sky" title={t.emptyTitle} body={t.emptyBody} />
        ) : renderList(tree, 1)}
      </div>
      <div className={styles.addUnit}>
        <InlineInput placeholder={t.newUnit} submitLabel={t.addUnit} onSubmit={add(null)} />
      </div>
      {hasArchived && (
        <label className={styles.toggle}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {common.showArchived}
        </label>
      )}
      <ConfirmDialog open={Boolean(confirm)} title={t.archiveTitle} body={t.archiveBody}
        confirmLabel={common.archive} busy={busy}
        onConfirm={() => setArchived(confirm, true)} onCancel={() => setConfirm(null)} />
      {del.state && (del.state.mode === 'confirm' ? (
        <ConfirmDialog open danger title={sd.topicTitle(del.state.item.title)}
          body={`${sd.topicBody(del.state.info.topics)} ${sd.irreversible}`}
          confirmLabel={sd.deleteForever} busy={del.busy} onConfirm={del.confirm} onCancel={del.close} />
      ) : (
        <ConfirmDialog open title={sd.topicBlockedTitle}
          body={`${blockedReason(del.state.info)} ${del.state.item.is_archived ? sd.alreadyArchivedHint : sd.archiveHint}`}
          confirmLabel={del.state.item.is_archived ? null : sd.archiveInstead} cancelLabel={sd.close} busy={busy}
          onConfirm={async () => { await setArchived(del.state.item, true); del.close(); }} onCancel={del.close} />
      ))}
    </Collapsible>
  );
}
