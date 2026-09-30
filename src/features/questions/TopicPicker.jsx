import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { readOpen, writeOpen } from '../../lib/useCollapsed';
import { buildTree } from '../../lib/topicTree';
import { common, questionEditor as t, topics as tt } from '../../i18n/he';
import tree from '../content/content.module.css';   // the SAME tree look as the course's topic tree
import styles from './questions.module.css';

const levelTone = { 1: 'lavender', 2: 'sky', 3: 'mint' };
const hasSelected = (node, sel) => sel.has(node.id) || node.children.some((c) => hasSelected(c, sel));

// Topic picker = the course's topic tree with a checkbox per node (multi-select, as before).
// Every node that has children gets an expand/collapse arrow, on every level (unit -> topic -> sub-topic).
// Opening is never forced: the user can always collapse. Initial state: branches that contain a selection are open;
// otherwise a single sibling is open and with several only the first (same rule as everywhere). Session-only memory.
// Archived topics appear only if already selected.
export default function TopicPicker({ topics, selected, onChange, storageScope = 'picker' }) {
  const [, bump] = useState(0);
  const selectedSet = new Set(selected);
  const roots = buildTree(topics.filter((x) => !x.is_archived || selectedSet.has(x.id)));
  if (roots.length === 0) return <p className={styles.muted}>{t.topicsNone}</p>;

  const toggle = (id) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const key = (id) => `${storageScope}:${id}`;
  const isOpen = (node, i, siblings) =>
    readOpen(key(node.id), hasSelected(node, selectedSet) || siblings.length === 1 || i === 0);
  const setOpen = (id, v) => { writeOpen(key(id), v); bump((n) => n + 1); };

  function list(nodes, level) {
    return (
      <ul className={`${tree.tree} ${styles.pickerTree}`} data-level={level}>
        {nodes.map((node, i) => {
          const kids = node.children.length > 0;
          const open = !kids || isOpen(node, i, nodes);
          const branchId = `picker-branch-${node.id}`;
          const on = selectedSet.has(node.id);
          return (
            <li key={node.id}>
              <div className={`${tree.topicRow} ${on ? styles.pickerOn : ''}`}>
                {kids ? (
                  <button type="button" className={tree.treeToggle} aria-expanded={open} aria-controls={branchId}
                    aria-label={`${open ? tt.collapse : tt.expand}: ${node.title}`}
                    onClick={() => setOpen(node.id, !open)}><ChevronDown size={18} aria-hidden="true" /></button>
                ) : <span className={tree.treeSpacer} aria-hidden="true" />}
                <label className={styles.pickerLabel}>
                  <input type="checkbox" checked={on} onChange={() => toggle(node.id)} />
                  <Badge tone={levelTone[level]}>{tt.levels[level]}</Badge>
                  <span className={styles.pickerTitle}>{node.title}</span>
                  {node.is_archived && <Badge>{common.archived}</Badge>}
                </label>
              </div>
              {kids && (
                <div id={branchId} className={tree.branch} data-open={open} inert={!open || undefined}>
                  <div className={tree.branchInner}>{list(node.children, level + 1)}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return <div className={styles.topicTreeWrap}>{list(roots, 1)}</div>;
}
