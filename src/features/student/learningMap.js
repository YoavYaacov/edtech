// Pure helpers for the student learning map (master spec §3).
// Two levels only: unit (level 1) > main topic (level 2). Sub-topics are never shown.
// A topic with no stored status is 'not_learned'. Unit status is DERIVED, never stored.
import { buildTree } from '../../lib/topicTree';

export const STATUSES = ['not_learned', 'learning', 'learned'];

export function statusOf(statusMap, topicId) {
  return statusMap.get(topicId) ?? 'not_learned';
}

export function deriveUnitStatus(topicStatuses) {
  if (topicStatuses.length === 0) return 'not_learned';
  if (topicStatuses.every((s) => s === 'learned')) return 'learned';
  if (topicStatuses.some((s) => s === 'learning' || s === 'learned')) return 'learning';
  return 'not_learned';
}

// topics: rows { id, parent_id, title, position, is_archived }; statuses: Map(topicId -> status)
export function buildLearningMap(topics, statuses) {
  const active = topics.filter((x) => !x.is_archived);
  return buildTree(active).map((unit) => {
    const items = unit.children.map((t) => ({ id: t.id, title: t.title, status: statusOf(statuses, t.id) }));
    return {
      id: unit.id,
      title: unit.title,
      status: deriveUnitStatus(items.map((i) => i.status)),
      topics: items,
      learnedCount: items.filter((i) => i.status === 'learned').length,
    };
  });
}

// Library eligibility: only 'learning' or 'learned' topics (early exposure is a teacher action, later batch).
export const isLibraryEligible = (status) => status === 'learning' || status === 'learned';

// "Missing table" tolerance so the UI works before the migration is applied.
export function isMissingStatusTable(error) {
  return Boolean(error) && (error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202');
}

// Upcoming deadlines from the student's assignments (no invented data).
export function upcomingDeadlines(assignments, now = Date.now(), limit = 4) {
  return assignments
    .filter((a) => a.due_at && a.status !== 'closed' && !(a.total > 0 && a.submitted === a.total))
    .map((a) => ({ ...a, dueMs: Date.parse(a.due_at) }))
    .filter((a) => Number.isFinite(a.dueMs))
    .sort((a, b) => a.dueMs - b.dueMs)
    .filter((a) => a.dueMs >= now - 24 * 3600e3)
    .slice(0, limit);
}

// Main topics = level 2 (children of root units), non-archived. Sub-topics (level 3) are excluded.
export function mainTopics(topics) {
  const roots = new Set(topics.filter((t) => !t.parent_id).map((t) => t.id));
  return topics.filter((t) => !t.is_archived && t.parent_id && roots.has(t.parent_id));
}
