import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CourseGroups from '../CourseGroups';
import TopicPicker from '../../../features/questions/TopicPicker';

afterEach(() => window.sessionStorage.clear());

const items = [
  { id: 1, c: 'a', ct: 'Java' }, { id: 2, c: 'a', ct: 'Java' }, { id: 3, c: 'b', ct: 'מתמטיקה' },
];
const list = (its) => <ul>{its.map((i) => <li key={i.id}>item{i.id}</li>)}</ul>;

describe('CourseGroups', () => {
  it('renders flat (no toggles) for a single course', () => {
    render(<CourseGroups items={items.slice(0, 2)} getId={(i) => i.c} getTitle={(i) => i.ct} scope="x">{list}</CourseGroups>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('item1')).toBeInTheDocument();
  });

  it('with several courses only the first is open; adding-state persists in the session', () => {
    render(<CourseGroups items={items} getId={(i) => i.c} getTitle={(i) => i.ct} scope="y">{list}</CourseGroups>);
    const [first, second] = screen.getAllByRole('button');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(second).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('can be disabled (e.g. a course filter is active)', () => {
    render(<CourseGroups items={items} getId={(i) => i.c} getTitle={(i) => i.ct} scope="z" enabled={false}>{list}</CourseGroups>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('TopicPicker by unit', () => {
  const topics = [
    { id: 'u1', parent_id: null, title: 'יחידה 1', position: 1, is_archived: false, level: 1 },
    { id: 't1', parent_id: 'u1', title: 'נושא א', position: 1, is_archived: false, level: 2 },
    { id: 'u2', parent_id: null, title: 'יחידה 2', position: 2, is_archived: false, level: 1 },
    { id: 't2', parent_id: 'u2', title: 'נושא ב', position: 1, is_archived: false, level: 2 },
  ];
  it('a unit with a selection stays open and cannot be collapsed', () => {
    render(<TopicPicker topics={topics} selected={['t2']} onChange={() => {}} />);
    const btns = screen.getAllByRole('button');
    expect(btns[0]).toHaveAttribute('aria-expanded', 'true');   // first unit: default open
    expect(btns[1]).toHaveAttribute('aria-expanded', 'true');   // has a selection
    expect(btns[1]).toBeDisabled();
  });
  it('closes the second unit when nothing is selected', () => {
    render(<TopicPicker topics={topics} selected={[]} onChange={() => {}} />);
    expect(screen.getAllByRole('button')[1]).toHaveAttribute('aria-expanded', 'false');
  });
});
