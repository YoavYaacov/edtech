import { describe, expect, it } from 'vitest';
import { sortNewestFirst } from '../notificationsApi';

// R1B-3: the newest notification is always on top, for teacher and student alike.
describe('sortNewestFirst', () => {
  it('orders by the most recent time, newest first', () => {
    const rows = [
      { key: 'a', latest: '2026-10-01T10:00:00Z' },
      { key: 'b', latest: '2026-10-03T10:00:00Z' },
      { key: 'c', latest: '2026-10-02T10:00:00Z' },
    ];
    expect(sortNewestFirst(rows).map((r) => r.key)).toEqual(['b', 'c', 'a']);
  });
  it('is stable on equal times (falls back to the key) and does not mutate its input', () => {
    const rows = [{ key: 'z', latest: 'T' }, { key: 'a', latest: 'T' }];
    expect(sortNewestFirst(rows).map((r) => r.key)).toEqual(['a', 'z']);
    expect(rows.map((r) => r.key)).toEqual(['z', 'a']);
  });
  it('treats a teacher group and a student feedback row on the same scale', () => {
    const teacher = [{ key: 't1', latest: '2026-10-05T08:00:00Z', oldest: '2026-09-01T00:00:00Z' }, { key: 't2', latest: '2026-10-06T08:00:00Z', oldest: '2026-10-06T08:00:00Z' }];
    expect(sortNewestFirst(teacher)[0].key).toBe('t2'); // a long-pending group is not pushed to the top by its old first submission
  });
  it('falls back to oldest when latest is missing', () => {
    expect(sortNewestFirst([{ key: 'a', oldest: '1' }, { key: 'b', oldest: '2' }])[0].key).toBe('b');
  });
});
