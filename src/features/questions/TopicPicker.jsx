import { buildTree, flattenTree } from '../../lib/topicTree';
import { common, questionEditor as t, topics as tt } from '../../i18n/he';
import styles from './questions.module.css';

// Checkbox list of a course's topics. Archived topics appear only if already selected.
export default function TopicPicker({ topics, selected, onChange }) {
  const selectedSet = new Set(selected);
  const shown = topics.filter((x) => !x.is_archived || selectedSet.has(x.id));
  const flat = flattenTree(buildTree(shown));
  if (flat.length === 0) return <p className={styles.muted}>{t.topicsNone}</p>;

  const toggle = (id) => onChange(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <ul className={styles.topicPicker}>
      {flat.map((x) => (
        <li key={x.id} style={{ paddingInlineStart: `${(x.level - 1) * 22}px` }}>
          <label className={`${styles.topicOption} ${selectedSet.has(x.id) ? styles.topicOn : ''}`}>
            <input type="checkbox" checked={selectedSet.has(x.id)} onChange={() => toggle(x.id)} />
            <span>{x.title}</span>
            <span className={styles.levelHint}>{tt.levels[x.level]}{x.is_archived ? ` · ${common.archived}` : ''}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
