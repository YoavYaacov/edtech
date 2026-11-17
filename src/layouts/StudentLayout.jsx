import { Home, BookOpen, Library } from 'lucide-react';
import AppShell from './AppShell';
import { nav } from '../i18n/he';

const items = [
  { to: '/student', label: nav.studentHome, icon: Home, end: true },
  { to: '/student/subjects', label: nav.studentSubjects, icon: BookOpen },
  { to: '/student/library', label: nav.studentLibrary, icon: Library },
];

export default function StudentLayout() {
  return <AppShell items={items} />;
}
