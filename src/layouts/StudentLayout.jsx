import { Home } from 'lucide-react';
import AppShell from './AppShell';
import { nav } from '../i18n/he';

const items = [
  { to: '/student', label: nav.studentHome, icon: Home, end: true },
];

export default function StudentLayout() {
  return <AppShell items={items} />;
}
