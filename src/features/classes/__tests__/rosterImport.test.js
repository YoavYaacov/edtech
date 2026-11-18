import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseRosterText, rowsToText } from '../rosterText';
import { readXlsxRows } from '../fileRows';

// Synthetic data only (valid check digits).
const HEAD = "מס'\tת.ז\tשם התלמיד\tמין\tשכבה\tמקבילה\tכתובת\tטלפון";
const R1 = '1\t936044502\tכהן דנה מירב\tנ\tי\t3\tרחוב הדגמה 1\t0501234567';
const R2 = '2\t442852497\tבר נועה\tנ\tי\t1\t\t';

describe('table paste', () => {
  it('reads a school-export paste by its header, family name first, ignoring other columns', () => {
    const { rows, problems } = parseRosterText(`דוח כיתה\n\n${HEAD}\n${R1}\n${R2}`);
    expect(problems).toEqual([]);
    expect(rows.map((r) => [r.first, r.last, r.id])).toEqual([['דנה מירב', 'כהן', '936044502'], ['נועה', 'בר', '442852497']]);
    expect(JSON.stringify(rows)).not.toContain('הדגמה');
  });
  it('reads a paste without a header', () => {
    expect(parseRosterText(`${R1}\n${R2}`).rows).toHaveLength(2);
  });
  it('reads separate first/last columns by header', () => {
    const { rows } = parseRosterText('שם פרטי\tשם משפחה\tת.ז\tכיתה\nדנה\tכהן\t936044502\tי1');
    expect(rows.map((r) => [r.first, r.last, r.id])).toEqual([['דנה', 'כהן', '936044502']]);
  });
  it('reports a bad ID with its line and skips title rows silently', () => {
    const { rows, problems } = parseRosterText(`כותרת\n${HEAD}\n${R1.replace('936044502', '936044503')}\n${R2}`);
    expect(problems).toEqual([{ line: 3, reason: 'invalid_id' }]);
    expect(rows).toHaveLength(1);
  });
});

async function makeXlsx() {
  const z = new JSZip();
  z.file('xl/workbook.xml', '<workbook><sheets><sheet name="a" sheetId="1" r:id="rId9"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Target="worksheets/sheet1.xml" Id="rId9"/></Relationships>');
  z.file('xl/sharedStrings.xml', '<sst><si><t>ת.ז</t></si><si><t>שם התלמיד</t></si><si><t>כהן דנה &amp; מירב</t></si></sst>');
  z.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c t="s" r="A1"><v>0</v></c><c t="s" r="C1"><v>1</v></c></row>'
    + '<row r="2"><c r="A2"><v>936044502</v></c><c t="s" r="C2"><v>2</v></c></row></sheetData></worksheet>');
  return z.generateAsync({ type: 'arraybuffer' });
}

describe('xlsx reader', () => {
  it('reads shared strings, numbers, entities and column gaps, whatever the attribute order', async () => {
    const rows = await readXlsxRows(await makeXlsx());
    expect(rows).toEqual([['ת.ז', '', 'שם התלמיד'], ['936044502', '', 'כהן דנה & מירב']]);
    const { rows: parsed } = parseRosterText(rowsToText(rows));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].last).toBe('כהן');
  });
});
