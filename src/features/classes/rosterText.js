import { cleanName, isValidIsraeliId, isValidName, normalizeIdNumber } from './identity';

// Parses pasted roster text: one student per line, "first, last, id" (comma / semicolon / tab) or "first last id".
// Returns { rows: [{line, first, last, id}], problems: [{line, reason}] }. Blank lines are ignored.
export function parseRosterText(text) {
  const rows = [];
  const problems = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const s = raw.trim();
    if (!s) return;
    let first; let last; let id;
    const parts = s.split(/[\t,;]+/).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 3) [first, last, id] = parts;
    else if (parts.length === 1) {
      const w = s.split(/\s+/);
      if (w.length >= 3) { id = w[w.length - 1]; first = w[0]; last = w.slice(1, -1).join(' '); }
    }
    if (!first || !last || !id) { problems.push({ line, reason: 'format' }); return; }
    if (!isValidName(first) || !isValidName(last)) { problems.push({ line, reason: 'invalid_name' }); return; }
    if (!isValidIsraeliId(id)) { problems.push({ line, reason: 'invalid_id' }); return; }
    rows.push({ line, first: cleanName(first), last: cleanName(last), id: normalizeIdNumber(id) });
  });
  return { rows, problems };
}
