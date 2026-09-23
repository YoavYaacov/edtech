import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import Logo from '../components/brand/Logo';
import { useAuth } from '../features/auth/AuthProvider';
import { nav, roles } from '../i18n/he';
import styles from './AppShell.module.css';

// items: [{ to, label, icon, end? }]
export default function AppShell({ items }) {
  const { profile, signOut } = useAuth();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}><Logo /></div>
        <nav aria-label={nav.mainNav} className={styles.nav}>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}>
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.user}>
          <div className={styles.userText}>
            <span className={styles.userName}>{profile.full_name || '—'}</span>
            <span className={styles.userRole}>{roles[profile.role]}</span>
          </div>
          <button type="button" className={styles.iconButton} onClick={signOut}
            aria-label={nav.signOut} title={nav.signOut}>
            <LogOut size={20} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <header className={styles.topbar}>
        <Logo />
        <button type="button" className={styles.iconButton} onClick={signOut}
          aria-label={nav.signOut} title={nav.signOut}>
          <LogOut size={20} aria-hidden="true" />
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.content}><Outlet /></div>
      </main>

      {items.length > 1 && (
        <nav aria-label={nav.mainNav} className={styles.tabbar}>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}>
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
