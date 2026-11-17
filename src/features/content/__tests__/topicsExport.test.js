import { describe, expect, it } from 'vitest';
import { buildTopicsExport, EXPORT_FORMAT } from '../topicsExport';

const topics = [
  { id: 'u1', parent_id: null, title: 'יחידה', position: 0 },
  { id: 'm2', parent_id: 'u1', title: 'ב', position: 1 },
  { id: 'm1', parent_id: 'u1', title: 'א', position: 0 },
  { id: 's1', parent_id: 'm1', title: 'תת', position: 0 },
  { id: 'x', parent_id: 'u1', title: 'ארכיון', position: 2, is_archived: true },
];
describe('topics export', () => {
  it('is the existing tree only: ids untouched, ordered, archived topics left out, nothing invented', () => {
    const e = buildTopicsExport({ id: 'c1', title: 'מתמטיקה' }, topics, new Date('2026-11-17T00:00:00Z'));
    expect(e.format).toBe(EXPORT_FORMAT);
    expect(e.subject).toEqual({ id: 'c1', title: 'מתמטיקה', topics: [{ id: 'u1', title: 'יחידה', children: [
      { id: 'm1', title: 'א', children: [{ id: 's1', title: 'תת' }] }, { id: 'm2', title: 'ב' }] }] });
    expect(JSON.stringify(e)).not.toMatch(/student|email|owner/);
  });
});
