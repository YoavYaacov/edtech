import { ClipboardList, FileQuestion, LayoutDashboard, Library, Users } from 'lucide-react';
import AppShell from './AppShell';
import { nav } from '../i18n/he';

// Add items here as later phases add pages.
const items = [
  { to: '/teacher', label: nav.teacherHome, icon: LayoutDashboard, end: true },
  { to: '/teacher/students', label: nav.students, icon: Users },
  { to: '/teacher/courses', label: nav.courses, icon: Library },
  { to: '/teacher/questions', label: nav.questionBank, icon: FileQuestion },
  { to: '/teacher/assignments', label: nav.assignments, icon: ClipboardList },
];

export default function TeacherLayout() {
  return <AppShell items={items} />;
}
