import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Settings, LogOut, HelpCircle, CalendarDays } from 'lucide-react';
import { useProfile } from '../../context/ProfileContext';
import { useAuth } from '../../context/AuthContext';
import { useTour } from '../../context/TourContext';
import NotificationsBell from './NotificationsBell';
import GlobalSearch from './GlobalSearch';
import Avatar from '../common/Avatar';
import Logo from '../common/Logo';

/**
 * Slim global top bar: the product logo + name on the left, the global
 * search box in the middle (members only — admins don't get one), and the calendar shortcut, notification bell, and profile avatar
 * (with its dropdown menu) on the right. Primary section navigation now lives in the right-hand SideNav —
 * this bar only carries things that belong on every page regardless of
 * section. Sticky across every page.
 */
export default function IconTopNav() {
  const { profile } = useProfile();
  const { logout, currentUser } = useAuth();
  // Admin accounts have no search bar and no guided tour (those are member features).
  const isAdmin = currentUser?.accountRole === 'admin';
  const { start: startTour } = useTour();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const handleKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 px-3 sm:px-5 bg-[#EFE9D9]/90 dark:bg-surface-dark/95 backdrop-blur-md border-b border-ink-500/10 dark:border-white/8">
      <NavLink
        to="/dashboard"
        className="shrink-0 rounded-lg hover:opacity-90 transition-opacity"
        aria-label="TaskIT dashboard"
      >
        <Logo size={34} textClassName="hidden sm:inline" />
      </NavLink>

      <div className="flex-1 min-w-0 flex justify-center">
        {!isAdmin && <GlobalSearch />}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <NavLink
          to="/calendar"
          data-tour="nav-calendar"
          title="Calendar"
          aria-label="Calendar"
          className={({ isActive }) =>
            `p-2.5 rounded-full transition-colors ${
              isActive
                ? 'bg-brand-700 text-white'
                : 'text-ink-500 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/8 hover:text-ink-900 dark:hover:text-white'
            }`
          }
        >
          <CalendarDays size={19} />
        </NavLink>

        <div data-tour="notif-bell">
          <NotificationsBell />
        </div>

        <div className="relative" ref={menuRef}>
          <button
            data-tour="profile-avatar"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Profile menu"
            className="rounded-full hover:brightness-110 transition-all"
          >
            <Avatar profile={profile} size={40} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-52 bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl shadow-elevated py-1.5 overflow-hidden"
            >
              <div className="px-3.5 py-2 border-b border-ink-500/10 dark:border-white/10">
                <p className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">{profile.name}</p>
                <p className="text-fluid-xs text-ink-500 truncate">{profile.email}</p>
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-fluid-sm text-ink-700 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/5 transition-colors"
              >
                <Settings size={15} /> Profile &amp; settings
              </button>
              {!isAdmin && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    startTour();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-fluid-sm text-ink-700 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/5 transition-colors"
                >
                  <HelpCircle size={15} /> Take a tour
                </button>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  navigate('/', { replace: true });
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-fluid-sm text-coral-500 hover:bg-coral-500/8 transition-colors"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
