// R1B-2 — pure logic of the Review screen (no React, no network). Everything the teacher sees as a "warning" is derived here.
import katex from 'katex';

export const DRAFT_KEYS = ['title', 'body_md', 'question_type', 'programming_language', 'is_language_neutral', 'starter_code',
  'difficulty', 'source_type', 'source_year', 'tags', 'topic_ids', 'hints', 'solution', 'teacher_notes'];

// Same whitelist the database applies (import_clean_draft). Sending anything else is pointless and is dropped.
export function cleanDraft(d) {
  const out = {};
  for (const k of DRAFT_KEYS) if (d && Object.prototype.hasOwnProperty.call(d, k) && d[k] !== undefined) out[k] = d[k];
  return out;
}

const stable = (v) => {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  return v;
};
export const sameJson = (a, b) => JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
// "Edited by the teacher" exactly as the database decides it (draft differs from the original proposal).
export const isEdited = (cand) => !sameJson(cleanDraft(cand.draft), cleanDraft(cand.proposal));

export const materialFlags = (cand) => (cand.flags ?? []).filter((f) => f?.severity === 'material');
export const hasMaterialFlag = (cand) => materialFlags(cand).length > 0;

export function sortCandidates(list) {
  return [...list].sort((a, b) => (a.source_pages?.[0] ?? 0) - (b.source_pages?.[0] ?? 0)
    || (a.ordinal ?? 0) - (b.ordinal ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));
}

export const FILTERS = ['pending', 'attention', 'approved', 'rejected', 'all'];
export function filterCandidates(list, filter) {
  switch (filter) {
    case 'pending': return list.filter((c) => c.review_status === 'pending');
    case 'attention': return list.filter((c) => c.review_status === 'pending' && ((c.flags ?? []).length > 0));
    case 'approved': return list.filter((c) => c.review_status === 'approved');
    case 'rejected': return list.filter((c) => c.review_status === 'rejected');
    default: return list;
  }
}
export function countByFilter(list) {
  return Object.fromEntries(FILTERS.map((f) => [f, filterCandidates(list, f).length]));
}

// The next pending candidate after `currentId` in display order (wraps once), or null.
export function nextPendingId(sortedList, currentId) {
  const i = sortedList.findIndex((c) => c.id === currentId);
  const after = sortedList.slice(i + 1).find((c) => c.review_status === 'pending');
  const before = sortedList.slice(0, Math.max(i, 0)).find((c) => c.review_status === 'pending');
  return (after ?? before)?.id ?? null;
}

// ---- math check (client side, advisory only: it never blocks anything) ----
// Finds $...$ and $$...$$ outside code (fenced blocks and inline code) and tries to render each with KaTeX.
export function findMathErrors(md) {
  if (typeof md !== 'string' || !md.includes('$')) return [];
  const noCode = md.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  const found = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let m;
  while ((m = re.exec(noCode)) !== null) {
    const tex = (m[1] ?? m[2]).trim();
    if (!tex) continue;
    try { katex.renderToString(tex, { throwOnError: true, strict: 'ignore', displayMode: m[1] !== undefined }); } catch { found.push(tex.slice(0, 60)); }
  }
  return found;
}

// ---- warnings ----
// tone: butter (needs attention) | neutral (information). `help` is plain Hebrew; texts live in i18n.
export function flagList(cand, mathErrors = []) {
  const out = (cand.flags ?? []).map((f) => ({ kind: f.kind, severity: f.severity, message: f.message }));
  if (mathErrors.length > 0 && !out.some((f) => f.kind === 'math_render_error')) out.push({ kind: 'math_render_error', severity: 'info', message: '' });
  return out;
}

// Maps an RPC failure to a stable key (never shows raw database text).
export function approvalErrorKey(error) {
  const msg = String(error?.message ?? '');
  if (msg.includes('title_required')) return 'titleRequired';
  if (msg.includes('topic_not_in_course')) return 'topicNotInCourse';
  if (error?.code === '42501') return 'forbidden';
  if (error?.code === 'P0002') return 'notFound';
  return 'generic';
}

// Draft fields that the editor form reads/writes, with the same defaults the database applies on approval.
export function draftForm(cand, course) {
  const d = cand.draft ?? {};
  const hints = Array.isArray(d.hints) ? d.hints : [];
  const sol = d.solution && typeof d.solution === 'object' ? d.solution : {};
  return {
    title: d.title ?? '', body_md: d.body_md ?? '', question_type: d.question_type ?? 'text',
    programming_language: d.programming_language ?? '', difficulty: d.difficulty ?? 'intermediate',
    topic_ids: Array.isArray(d.topic_ids) ? d.topic_ids : [],
    hint1: hints.find((h) => h.level === 1)?.content_md ?? '', hint2: hints.find((h) => h.level === 2)?.content_md ?? '',
    solution_code: sol.solution_code ?? '', explanation_md: sol.explanation_md ?? '', teacher_notes: d.teacher_notes ?? '',
    courseLanguage: course?.programming_language ?? '',
  };
}

// Writes ONE form change into a draft and returns the new draft. Empty optional parts are removed, so an untouched
// candidate stays identical to its proposal (that is what makes "teacher_edited" honest).
export function applyFormChange(draft, patch) {
  const d = { ...(draft ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'hint1' || k === 'hint2') {
      const cur = Array.isArray(d.hints) ? d.hints : [];
      const lvl = k === 'hint1' ? 1 : 2;
      const next = [...cur.filter((h) => h.level !== lvl), ...(v.trim() ? [{ level: lvl, content_md: v }] : [])].sort((a, b) => a.level - b.level);
      if (next.length) d.hints = next; else delete d.hints;
    } else if (k === 'solution_code' || k === 'explanation_md') {
      const sol = { ...(d.solution && typeof d.solution === 'object' ? d.solution : {}), [k]: v };
      if (!(sol.solution_code ?? '').trim() && !(sol.explanation_md ?? '').trim()) delete d.solution; else d.solution = sol;
    } else if (k === 'teacher_notes') {
      if (v.trim()) d.teacher_notes = v; else delete d.teacher_notes;
    } else if (k === 'question_type') {
      d.question_type = v;
      if (v === 'text') delete d.programming_language;
    } else if (k === 'programming_language') {
      if (v) d.programming_language = v; else delete d.programming_language;
    } else {
      d[k] = v;
    }
  }
  return d;
}
