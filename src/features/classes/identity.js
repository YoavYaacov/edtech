// Client-side mirror of the database rules (the database is the authority; this only gives instant feedback).
// An Israeli ID number is NOT proof of identity - it is only checked for format here and on the server.
export function normalizeIdNumber(raw) {
  return String(raw ?? '').replace(/[\s-]/g, '');
}

export function isValidIsraeliId(raw) {
  const s = normalizeIdNumber(raw);
  if (!/^\d{5,9}$/.test(s)) return false;
  const p = s.padStart(9, '0');
  if (/^0+$/.test(p)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let d = Number(p[i]) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

export function cleanName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

export function isValidName(raw) {
  const s = cleanName(raw);
  // eslint-disable-next-line no-control-regex
  return s.length >= 1 && s.length <= 40 && !/[<>\u0000-\u001f\u007f]/.test(s);
}
