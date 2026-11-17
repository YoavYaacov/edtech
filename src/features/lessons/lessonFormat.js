// Lesson package format v1 — manifest validation, stable keys and DETERMINISTIC topic assignment.
// Pure functions only (no DOM, no network). See docs/lesson-package-format.md.

export const FORMAT_VERSION = 1;
export const MANIFEST_FILE = 'hevanti.json';
export const MANIFEST_SCRIPT_ID = 'hevanti-manifest';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[\p{L}\p{N}][\p{L}\p{N}_.-]{2,79}$/u;

const str = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);

// Returns { manifest, problems: [code] }. Unknown fields are ignored. Never throws.
export function validateManifest(raw) {
  const problems = [];
  if (raw == null) return { manifest: null, problems };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { manifest: null, problems: ['manifest_invalid'] };
  if (raw.format != null && raw.format !== FORMAT_VERSION) problems.push('manifest_format');
  const m = { format: FORMAT_VERSION };
  if (raw.lessonId != null) {
    if (typeof raw.lessonId === 'string' && KEY.test(raw.lessonId)) m.lessonId = raw.lessonId;
    else problems.push('manifest_lesson_id');
  }
  if (raw.title != null) { m.title = str(raw.title, 200); if (!m.title) problems.push('manifest_title'); }
  for (const f of ['subject', 'grade', 'level', 'treeVersion', 'contentVersion']) {
    if (raw[f] != null) { m[f] = str(String(raw[f]), 100); if (!m[f]) delete m[f]; }
  }
  m.topicIds = [];
  if (raw.topicIds != null) {
    if (Array.isArray(raw.topicIds) && raw.topicIds.length <= 50 && raw.topicIds.every((x) => typeof x === 'string' && UUID.test(x))) {
      m.topicIds = [...new Set(raw.topicIds.map((x) => x.toLowerCase()))];
    } else problems.push('manifest_topic_ids');
  }
  m.topicPaths = [];
  if (raw.topicPaths != null) {
    const ok = Array.isArray(raw.topicPaths) && raw.topicPaths.length <= 50 && raw.topicPaths.every((p) =>
      Array.isArray(p) && p.length >= 1 && p.length <= 3 && p.every((s) => typeof s === 'string' && s.trim() && s.length <= 200));
    if (ok) m.topicPaths = raw.topicPaths.map((p) => p.map((s) => s.trim()));
    else problems.push('manifest_topic_paths');
  }
  return { manifest: m, problems };
}

// Hebrew-safe normalisation for EXACT-name matching: NFKC, no niqqud, no quote/geresh marks,
// maqaf/hyphens/underscores = space, collapsed whitespace, lower-case.
export function normalizeName(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u05F3\u05F4'"`\u2018\u2019\u201C\u201D]/g, '')
    .replace(/[\u05BE\-_\u2010-\u2015]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Stable key when the package gives none: derived from the title, so re-uploading the same title = same lesson.
export function slugKey(title) {
  const s = normalizeName(title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return s.length >= 3 ? s : null;
}

// courses: [{ id, title, topics: [{ id, parent_id, title, is_archived }] }] (the teacher's own).
// Deterministic order: valid ids -> exact normalised names -> manual. Never guesses.
// Returns { status: 'assigned'|'manual', method?, courseId?, topicIds?, reason? }.
export function assignTopics(manifest, courses) {
  const m = manifest ?? {};
  const live = courses.map((c) => ({ ...c, topics: c.topics.filter((t) => !t.is_archived) }));

  if (m.topicIds?.length) {
    const found = m.topicIds.map((id) => {
      for (const c of live) { const t = c.topics.find((x) => x.id.toLowerCase() === id); if (t) return { c, t }; }
      return null;
    });
    if (found.some((x) => !x)) return { status: 'manual', reason: 'unknown_ids' };
    const courseIds = new Set(found.map((x) => x.c.id));
    if (courseIds.size !== 1) return { status: 'manual', reason: 'mixed_courses' };
    return { status: 'assigned', method: 'ids', courseId: found[0].c.id, topicIds: found.map((x) => x.t.id) };
  }

  if (m.topicPaths?.length) {
    let candidates = live;
    if (m.subject) {
      candidates = live.filter((c) => normalizeName(c.title) === normalizeName(m.subject));
      if (candidates.length === 0) return { status: 'manual', reason: 'unknown_subject' };
    }
    const resolve = (course, path) => {
      const want = path.map(normalizeName);
      const byParent = (pid) => course.topics.filter((t) => (t.parent_id ?? null) === pid);
      let level = byParent(null).filter((t) => normalizeName(t.title) === want[0]);
      for (let i = 1; i < want.length; i++) {
        level = level.flatMap((p) => byParent(p.id).filter((t) => normalizeName(t.title) === want[i]));
      }
      return level;
    };
    const picked = [];
    for (const path of m.topicPaths) {
      const hits = candidates.flatMap((c) => resolve(c, path).map((t) => ({ c, t })));
      if (hits.length === 0) return { status: 'manual', reason: 'path_not_found' };
      if (hits.length > 1) return { status: 'manual', reason: 'path_ambiguous' };
      picked.push(hits[0]);
    }
    if (new Set(picked.map((x) => x.c.id)).size !== 1) return { status: 'manual', reason: 'mixed_courses' };
    return { status: 'assigned', method: 'names', courseId: picked[0].c.id, topicIds: [...new Set(picked.map((x) => x.t.id))] };
  }

  return { status: 'manual', reason: 'no_metadata' };
}
