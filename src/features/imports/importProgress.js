// R1B-1 — pure helpers that turn the chunk rows into what the processing screen shows.
// A chunk that was split is replaced by its single-page children, so it is excluded from every count (no double counting).

const pagesOf = (c) => c.page_to - c.page_from + 1;
const kindOf = (w) => (typeof w === 'string' ? w : w?.kind);

// [{from,to}] merged and sorted: pages 4,5,6,9 => "4–6, 9"
export function rangesText(chunks) {
  const spans = chunks.map((c) => [c.page_from, c.page_to]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [from, to] of spans) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to); else merged.push([from, to]);
  }
  return merged.map(([f, t]) => (f === t ? `${f}` : `${f}–${t}`)).join(', ');
}

export function computeProgress(chunks, pageCount) {
  const leaves = (chunks ?? []).filter((c) => c.status !== 'split');
  const done = leaves.filter((c) => c.status === 'done');
  const failed = leaves.filter((c) => c.status === 'failed');
  const open = leaves.filter((c) => c.status === 'pending' || c.status === 'processing');
  const pagesDone = done.reduce((s, c) => s + pagesOf(c), 0);
  const total = pageCount || leaves.reduce((s, c) => s + pagesOf(c), 0);
  const current = open.find((c) => c.status === 'processing')
    ?? [...open].sort((a, b) => a.page_from - b.page_from)[0] ?? null;
  const missing = done.filter((c) => (c.warnings ?? []).some((w) => kindOf(w) === 'possible_missing_questions'));
  return {
    pagesDone, pageCount: total, percent: total > 0 ? Math.min(100, Math.round((pagesDone / total) * 100)) : 0,
    openChunks: open.length, failed, failedText: rangesText(failed), missingText: rangesText(missing), hasMissing: missing.length > 0,
    current: current ? { from: current.page_from, to: current.page_to } : null,
    // Nothing has been attempted yet: the only moment a "same file was imported before" decision is meaningful.
    untouched: leaves.length > 0 && leaves.every((c) => c.status === 'pending' && c.attempts === 0),
  };
}

export const titleOfCandidate = (cand) => (typeof cand?.draft?.title === 'string' ? cand.draft.title.trim() : '');
