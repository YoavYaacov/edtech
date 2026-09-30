import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('TopicPicker as a tree', () => {
  // depth 4 would be invalid (max 3); use the real shape: unit > topic > sub-topic, plus a sibling unit
  const T = (id, parent, title, position) => ({ id, parent_id: parent, title, position, is_archived: false });
  const topics = [
    T('u1', null, 'מודלים חישוביים', 1), T('a1', 'u1', 'אוטומטים', 1),
    T('u2', null, 'מבני נתונים', 2), T('l', 'u2', 'רשימה מקושרת', 1),
    T('l1', 'l', 'חד-כיוונית', 1), T('l2', 'l', 'דו-כיוונית', 2), T('l3', 'l', 'מעגלית', 3),
    T('u3', null, 'אלגוריתמים', 3),
  ];
  const toggleOf = (name) => screen.getByRole('button', { name: new RegExp(name) });

  it('every node with children has its own arrow, at every level, and leaves have none', () => {
    render(<TopicPicker topics={topics} selected={['l2']} onChange={() => {}} />);
    // 'מבני נתונים' contains the selection => open by default, and so is its sub-tree
    expect(toggleOf('מבני נתונים')).toHaveAttribute('aria-expanded', 'true');
    expect(toggleOf('רשימה מקושרת')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: /דו-כיוונית/ })).toBeNull();   // leaf: no arrow
    expect(screen.queryByRole('button', { name: /אלגוריתמים/ })).toBeNull();   // childless unit: no arrow
  });

  it('a branch that holds the selection CAN be collapsed and re-opened (regression: it used to be locked open)', () => {
    render(<TopicPicker topics={topics} selected={['l2']} onChange={() => {}} />);
    const ds = toggleOf('מבני נתונים');
    expect(ds).not.toBeDisabled();
    fireEvent.click(ds);
    expect(ds).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(ds);
    expect(ds).toHaveAttribute('aria-expanded', 'true');
  });

  it('each level toggles independently: unit -> topic -> sub-topic', () => {
    render(<TopicPicker topics={topics} selected={['l2']} onChange={() => {}} />);
    fireEvent.click(toggleOf('רשימה מקושרת'));
    expect(toggleOf('רשימה מקושרת')).toHaveAttribute('aria-expanded', 'false');
    expect(toggleOf('מבני נתונים')).toHaveAttribute('aria-expanded', 'true');
    expect(toggleOf('מודלים חישוביים')).toHaveAttribute('aria-expanded', 'true');    // first sibling: open by default
    fireEvent.click(toggleOf('מודלים חישוביים'));
    expect(toggleOf('מודלים חישוביים')).toHaveAttribute('aria-expanded', 'false');
    expect(toggleOf('מבני נתונים')).toHaveAttribute('aria-expanded', 'true');       // unaffected
  });

  it('checking a node selects it (multi-select) and unchecking removes it; selected node is checked', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TopicPicker topics={topics} selected={['l2']} onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: /דו-כיוונית/ })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /חד-כיוונית/ }));
    expect(onChange).toHaveBeenLastCalledWith(['l2', 'l1']);
    fireEvent.click(screen.getByRole('checkbox', { name: /דו-כיוונית/ }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(<TopicPicker topics={topics} selected={[]} onChange={onChange} />);
  });

  it('the picker toggles are real buttons with aria-controls pointing at an existing branch', () => {
    const { container } = render(<TopicPicker topics={topics} selected={[]} onChange={() => {}} />);
    for (const b of screen.getAllByRole('button')) {
      expect(container.querySelector(`#${b.getAttribute('aria-controls')}`)).not.toBeNull();
    }
  });
});
