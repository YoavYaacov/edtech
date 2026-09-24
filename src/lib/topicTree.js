// Pure helpers for the adjacency-list topic tree (max depth 3).

const byPosition = (a, b) => a.position - b.position || a.title.localeCompare(b.title, 'he');

export function buildTree(topics) {
  const nodes = new Map(topics.map((t) => [t.id, { ...t, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : null;
    (parent ? parent.children : roots).push(node);
  }
  const sortRec = (list) => { list.sort(byPosition); list.forEach((n) => sortRec(n.children)); return list; };
  return sortRec(roots);
}

// Depth-first list: [{ id, title, level, is_archived }]
export function flattenTree(tree, level = 1, out = []) {
  for (const n of tree) {
    out.push({ id: n.id, title: n.title, level, is_archived: n.is_archived, parent_id: n.parent_id });
    flattenTree(n.children, level + 1, out);
  }
  return out;
}

export function descendantIds(topics, rootId) {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const t of topics) if (t.parent_id === ids[i]) ids.push(t.id);
  }
  return ids;
}

export function nextPosition(topics, parentId) {
  const siblings = topics.filter((t) => (t.parent_id ?? null) === (parentId ?? null));
  return siblings.reduce((max, t) => Math.max(max, t.position), 0) + 1;
}
