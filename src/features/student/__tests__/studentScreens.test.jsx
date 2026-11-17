import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnitCard } from '../SubjectMapPage';
import { buildLearningMap } from '../learningMap';
import fs from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../..');
const read = (p) => fs.readFileSync(join(SRC, p), 'utf8');

describe('UnitCard', () => {
  const unit = buildLearningMap([
    { id: 'u', parent_id: null, title: 'רשימות', position: 1, is_archived: false },
    { id: 't', parent_id: 'u', title: 'שרשרת חוליות', position: 1, is_archived: false },
  ], new Map([['t', 'learning']]))[0];

  it('opens to show main topics with teacher-set status, no links', () => {
    render(<UnitCard unit={unit} defaultOpen={false} />);
    expect(screen.queryByText('שרשרת חוליות')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /רשימות/ }));
    expect(screen.getByText('שרשרת חוליות')).toBeInTheDocument();
    expect(screen.getAllByText('לומדים עכשיו').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('student surface guards', () => {
  const files = ['SubjectsPage', 'SubjectMapPage', 'LibraryPage', 'StatusBadge'].map((f) => read(`features/student/${f}.jsx`));
  it('never shows the term "קורס" to students (code strings)', () => {
    for (const src of files) expect(src).not.toMatch(/קורס/);
  });
  it('student i18n blocks do not contain "קורס"', () => {
    const he = read('i18n/he.js');
    for (const name of ['studentHome', 'studentMap']) {
      const block = he.split(`export const ${name} = {`)[1].split('\n};')[0];
      expect(block).not.toMatch(/קורס/);
    }
  });
  it('student code has no write calls to topic status', () => {
    for (const src of files) expect(src).not.toMatch(/set_topic_status|\.insert\(|\.update\(|\.delete\(/);
  });
});

describe('class-level status (architecture guard)', () => {
  it('migration keys status by (class, topic) and one class per subject per student', () => {
    const sql = fs.readFileSync(join(SRC, '../supabase/migrations/20261117000100_classes_and_topic_status.sql'), 'utf8');
    expect(sql).toMatch(/primary key \(class_id, topic_id\)/);
    expect(sql).toMatch(/unique \(course_id, student_id\)/);
    expect(sql).not.toMatch(/grant (insert|update|delete)/i);
  });
  it('follows the project deletion policy: no ON DELETE CASCADE into courses/topics/classes', () => {
    const sql = fs.readFileSync(join(SRC, '../supabase/migrations/20261117000100_classes_and_topic_status.sql'), 'utf8');
    const cascades = sql.split('\n').filter((l) => /^[^-]*on delete cascade/i.test(l));
    expect(cascades).toHaveLength(1); // only class_students -> course_enrollments
    expect(cascades[0]).toMatch(/course_enrollments/);
    expect(sql).not.toMatch(/version = '20261003000100'/);
  });
  it('teacher status writes always carry the class id', () => {
    const api = read('features/content/contentApi.js');
    expect(api).toMatch(/set_topic_status', \{ p_class_id/);
  });
});
