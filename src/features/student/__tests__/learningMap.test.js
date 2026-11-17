import { describe, expect, it } from 'vitest';
import { buildLearningMap, deriveUnitStatus, isMissingStatusTable, mainTopics, upcomingDeadlines } from '../learningMap';

const topics = [
  { id: 'u1', parent_id: null, title: 'יחידה א', position: 1, is_archived: false },
  { id: 't1', parent_id: 'u1', title: 'נושא 1', position: 1, is_archived: false },
  { id: 't2', parent_id: 'u1', title: 'נושא 2', position: 2, is_archived: false },
  { id: 's1', parent_id: 't1', title: 'תת-נושא', position: 1, is_archived: false },
  { id: 'ta', parent_id: 'u1', title: 'ארכיון', position: 3, is_archived: true },
  { id: 'u2', parent_id: null, title: 'יחידה ב', position: 2, is_archived: false },
];

describe('learning map', () => {
  it('shows two levels only, never sub-topics or archived topics', () => {
    const map = buildLearningMap(topics, new Map());
    expect(map.map((u) => u.title)).toEqual(['יחידה א', 'יחידה ב']);
    expect(map[0].topics.map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('defaults every topic to not_learned', () => {
    const map = buildLearningMap(topics, new Map());
    expect(map[0].topics.every((t) => t.status === 'not_learned')).toBe(true);
    expect(map[0].status).toBe('not_learned');
  });
  it('derives unit status and counts; allows several topics learning at once', () => {
    const map = buildLearningMap(topics, new Map([['t1', 'learning'], ['t2', 'learning']]));
    expect(map[0].status).toBe('learning');
    const done = buildLearningMap(topics, new Map([['t1', 'learned'], ['t2', 'learned']]));
    expect(done[0].status).toBe('learned');
    expect(done[0].learnedCount).toBe(2);
  });
  it('an empty unit is not_learned', () => {
    expect(deriveUnitStatus([])).toBe('not_learned');
  });
  it('mainTopics returns level 2 only', () => {
    expect(mainTopics(topics).map((t) => t.id)).toEqual(['t1', 't2']);
  });
  it('detects a missing status table (migration not applied yet)', () => {
    expect(isMissingStatusTable({ code: '42P01' })).toBe(true);
    expect(isMissingStatusTable({ code: '42501' })).toBe(false);
    expect(isMissingStatusTable(null)).toBe(false);
  });
  it('upcomingDeadlines skips closed/completed/undated, sorts ascending', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    const a = [
      { id: 'a', due_at: '2026-11-20T00:00:00Z', status: 'published', total: 2, submitted: 0 },
      { id: 'b', due_at: '2026-11-18T00:00:00Z', status: 'published', total: 2, submitted: 1 },
      { id: 'c', due_at: '2026-11-19T00:00:00Z', status: 'closed', total: 2, submitted: 0 },
      { id: 'd', due_at: '2026-11-19T00:00:00Z', status: 'published', total: 1, submitted: 1 },
      { id: 'e', due_at: null, status: 'published', total: 1, submitted: 0 },
    ];
    expect(upcomingDeadlines(a, now).map((x) => x.id)).toEqual(['b', 'a']);
  });
});
