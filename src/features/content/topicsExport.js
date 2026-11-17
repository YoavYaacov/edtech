import { buildTree } from '../../lib/topicTree';

// "Copy update for Claude": the subject's CURRENT topic tree as compact JSON, to paste into a Claude chat that uses the
// hevanti-lesson-builder skill (it merges this into its topics-tree.json). No API, no secrets, no student data.
export const EXPORT_FORMAT = 'hevanti-topics-export';

export function buildTopicsExport(course, topics, now = new Date()) {
  const strip = (n) => ({ id: n.id, title: n.title, ...(n.children.length ? { children: n.children.map(strip) } : {}) });
  return {
    format: EXPORT_FORMAT, version: 1, exportedAt: now.toISOString(),
    subject: { id: course.id, title: course.title, topics: buildTree(topics.filter((t) => !t.is_archived)).map(strip) },
  };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
