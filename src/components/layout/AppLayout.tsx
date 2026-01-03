import { Outlet, NavLink } from 'react-router-dom';
import { Book, Calendar, ShoppingCart, Settings } from 'lucide-react';
import { BackupReminderProvider } from '@/context/BackupReminderContext';
import styles from './AppLayout.module.css';

const navItems = [
  { to: '/', icon: Book, label: 'Recipes' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/shopping', icon: ShoppingCart, label: 'Shopping' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function AppLayout() {
  return (
    <BackupReminderProvider>
      <div className={styles.layout}>
        <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🍽️</span>
          <span className={styles.logoText}>Platecraft</span>
        </div>
        <nav className={styles.desktopNav}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.active : ''}`
              }
              end={to === '/'}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <nav className={styles.mobileNav}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${styles.mobileNavLink} ${isActive ? styles.active : ''}`
            }
            end={to === '/'}
          >
            <Icon size={20} />
            <span className={styles.mobileNavLabel}>{label}</span>
          </NavLink>
        ))}
      </nav>
      </div>
    </BackupReminderProvider>
  );
}
