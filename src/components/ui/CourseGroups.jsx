import Collapsible from './Collapsible';

// Groups items by course. With fewer than 2 groups (or grouping disabled) it renders `children(items)`
// unchanged, so single-course users see exactly what they saw before.
// With several groups: one Collapsible per course, only the first open by default; state is session-only.
//   scope   unique prefix for the session key (e.g. 'bank', 'teacher-assignments')
export function groupByCourse(items, getId, getTitle) {
  const groups = new Map();
  for (const it of items) {
    const id = getId(it) ?? '_';
    if (!groups.has(id)) groups.set(id, { id, title: getTitle(it) ?? '', items: [] });
    groups.get(id).items.push(it);
  }
  return [...groups.values()];
}

export default function CourseGroups({ items, getId, getTitle, scope, enabled = true, count, children }) {
  const groups = groupByCourse(items, getId, getTitle);
  if (!enabled || groups.length < 2) return children(items);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {groups.map((g, i) => (
        <Collapsible key={g.id} title={g.title} meta={count ? count(g.items.length) : g.items.length}
          storageKey={`${scope}:${g.id}`} defaultOpen={i === 0} headingLevel={2}
          className="course-group" variant="card">
          {children(g.items)}
        </Collapsible>
      ))}
    </div>
  );
}
