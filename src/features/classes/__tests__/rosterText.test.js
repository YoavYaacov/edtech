import { describe, expect, it } from 'vitest';
import { parseRosterText } from '../rosterText';

describe('parseRosterText', () => {
  it('reads comma, semicolon, tab and space separated lines, skipping blanks', () => {
    const { rows, problems } = parseRosterText('דנה, כהן, 936044502\n\nנועה;בר;442852497\nתום\tגור\t581218211\nאורי בן דוד 975142126\n');
    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.line, r.first, r.last, r.id])).toEqual([
      [1, 'דנה', 'כהן', '936044502'], [3, 'נועה', 'בר', '442852497'], [4, 'תום', 'גור', '581218211'], [5, 'אורי', 'בן דוד', '975142126']]);
  });
  it('normalizes ID separators', () => expect(parseRosterText('א, ב, 93604450-2').rows[0].id).toBe('936044502'));
  it('reports bad lines with their line number and keeps the good ones', () => {
    const { rows, problems } = parseRosterText('דנה, כהן, 936044503\nרק שם\n<b>, x, 936044502\nדנה, כהן, 936044502');
    expect(problems).toEqual([{ line: 1, reason: 'invalid_id' }, { line: 2, reason: 'format' }, { line: 3, reason: 'invalid_name' }]);
    expect(rows).toHaveLength(1);
  });
});
