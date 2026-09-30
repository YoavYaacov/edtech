import Collapsible from '../../components/ui/Collapsible';
import { buildTree, flattenTree } from '../../lib/topicTree';
import { common, questionEditor as t, topics as tt } from '../../i18n/he';
import styles from './questions.module.css';

// Checkbox list of a course's topics, grouped by unit (level-1 topic). Archived topics appear only if already selected.
// A unit that contains a selected topic is always open; otherwise a single unit is open, and with several only the first.
export default function TopicPicker({ topics, selected, onChange }) {
  const selectedSet = new Set(selected);
  const shown = topics.filter((x) => !x.is_archived || selectedSet.has(x.id));
  const tree = buildTree(shown);
  if (tree.length === 0) return <p className={styles.muted}>{t.topicsNone}</p>;

  const toggle = (id) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const renderOption = (x, base) => (
    <li key={x.id} style={{ paddingInlineStart: `${(x.level - base) * 22}px` }}>
      <label className={`${styles.topicOption} ${selectedSet.has(x.id) ? styles.topicOn : ''}`}>
        <input type="checkbox" checked={selectedSet.has(x.id)} onChange={() => toggle(x.id)} />
        <span>{x.title}</span>
        <span className={styles.levelHint}>{tt.levels[x.level]}{x.is_archived ? ` · ${common.archived}` : ''}</span>
      </label>
    </li>
  );

  return (
    <div className={styles.topicUnits}>
      {tree.map((unit, i) => {
        const flat = flattenTree([unit]);
        const selCount = flat.filter((x) => selectedSet.has(x.id)).length;
        return (
          <Collapsible key={unit.id} title={unit.title} headingLevel={4} variant="card"
            meta={selCount > 0 ? t.topicsSelected(selCount) : undefined}
            storageKey={`picker:${unit.id}`} defaultOpen={tree.length === 1 || i === 0} forceOpen={selCount > 0}>
            <ul className={styles.topicPicker}>{flat.map((x) => renderOption(x, 1))}</ul>
          </Collapsible>
        );
      })}
    </div>
  );
}
