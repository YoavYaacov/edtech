import { cleanName, isValidIsraeliId, isValidName, normalizeIdNumber } from './identity';

// Parses pasted roster text: one student per line, "first, last, id" (comma / semicolon / tab) or "first last id".
// Returns { rows: [{line, first, last, id}], problems: [{line, reason}] }. Blank lines are ignored.
export function parseRosterText(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  if (isTable(lines)) return parseRosterTable(lines);
  const rows = [];
  const problems = [];
  lines.forEach((raw, i) => {
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

// ---- Table paste / file (e.g. a school-system export): only name and ID are read, every other column is ignored. ----
const HEADER = /ת\.?\s?ז|תעודת זהות|שם התלמיד|שם משפחה|שם פרטי/;
const ID_HEAD = /^(ת\.?\s?ז\.?|תעודת זהות|מספר זהות)$/;
const FULL_HEAD = /^(שם התלמיד|שם התלמידה|שם מלא|שם)$/;
const FIRST_HEAD = /^שם פרטי$/;
const LAST_HEAD = /^שם משפחה$/;

const cells = (line) => line.split('\t').map((x) => x.trim().replace(/^"|"$/g, '').trim());

// A pasted table: a header row naming the ID / name columns, or a row with 4+ tab-separated cells.
function isTable(lines) {
  return lines.some((l) => {
    if (!l.includes('\t')) return false;
    const c = cells(l);
    return c.length >= 4 || (c.length >= 2 && c.some((x) => ID_HEAD.test(x)) && c.some((x) => HEADER.test(x)));
  });
}

function parseRosterTable(lines) {
  const rows = [];
  const problems = [];
  let col = null; // {id, full, first, last}
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const c = cells(raw);
    const idCol = c.findIndex((x) => ID_HEAD.test(x));
    if (idCol >= 0 && c.some((x) => FULL_HEAD.test(x) || FIRST_HEAD.test(x) || LAST_HEAD.test(x))) {
      col = { id: idCol, full: c.findIndex((x) => FULL_HEAD.test(x)), first: c.findIndex((x) => FIRST_HEAD.test(x)), last: c.findIndex((x) => LAST_HEAD.test(x)) };
      return;
    }
    let id; let first; let last;
    if (col) {
      id = c[col.id];
      if (col.first >= 0 && col.last >= 0) { first = c[col.first]; last = c[col.last]; } else if (col.full >= 0) [last, first] = splitFullName(c[col.full]);
    } else {
      // no header: the first 5-9 digit cell is the ID and the first cell with letters after it is the name (family name first)
      const at = c.findIndex((x) => /^\d{5,9}$/.test(x.replace(/[\s-]/g, '')));
      if (at >= 0) {
        id = c[at];
        const nm = c.slice(at + 1).find((x) => /\p{L}/u.test(x));
        if (nm) [last, first] = splitFullName(nm);
      }
    }
    // a row with no ID at all (a title, a subtotal) is not a student row
    if (!id && !c.slice(1).some((x) => /^\d{5,9}$/.test(x))) return;
    if (!first || !last || !id) { problems.push({ line, reason: 'format' }); return; }
    if (!isValidName(first) || !isValidName(last)) { problems.push({ line, reason: 'invalid_name' }); return; }
    if (!isValidIsraeliId(id)) { problems.push({ line, reason: 'invalid_id' }); return; }
    rows.push({ line, first: cleanName(first), last: cleanName(last), id: normalizeIdNumber(id) });
  });
  return { rows, problems };
}

// School exports write the family name first: "כהן דנה מירב" -> last "כהן", first "דנה מירב".
function splitFullName(full) {
  const w = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  return w.length >= 2 ? [w[0], w.slice(1).join(' ')] : [undefined, undefined];
}

// Turns table rows (from a file) into the pasted-text form, so one parser and one review box serve both.
export function rowsToText(rows) {
  return rows.map((r) => r.map((x) => String(x ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}
