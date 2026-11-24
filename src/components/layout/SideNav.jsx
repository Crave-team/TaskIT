import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  UserCog,
  SlidersHorizontal,
  ScrollText,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true, tourId: 'nav-dashboard' },
  { to: '/tasks', label: 'My Workspace', icon: KanbanSquare, tourId: 'nav-tasks' },
  { to: '/team', label: 'Team', icon: Users, tourId: 'nav-team' },
];

const COLLAPSE_KEY = 'taskit_sidenav_collapsed';

/**
 * Reads the persisted collapsed state synchronously so the sidebar doesn't
 * flash open/closed on every page navigation (each page remounts
 * AppLayout/SideNav). Falls back to collapsed-by-default on narrow
 * viewports (phones/tablets) the first time, before any choice is saved.
 */
function readCollapsed() {
  try {
    const stored = localStorage.getItem(COLLAPSE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // ignore storage failures (e.g. private browsing)
  }
  return typeof window !== 'undefined' && window.innerWidth < 1024;
}

/**
 * Primary app navigation, docked as a vertical rail on the right edge of
 * the screen. The person can collapse it to an icon-only rail or expand it
 * to show labels — the toggle lives at the top of the rail itself (just
 * below the header), not in the header bar. The collapsed/expanded choice
 * is remembered across page navigation and reloads.
 */
export default function SideNav() {
  const { currentUser } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore storage failures (e.g. private browsing)
    }
  }, [collapsed]);

  const items = currentUser?.accountRole === 'admin'
    ? [
        ...navItems,
        { to: '/users', label: 'Users', icon: UserCog },
        { to: '/system', label: 'System Settings', icon: SlidersHorizontal },
        { to: '/activity', label: 'Activity Log', icon: ScrollText },
      ]
    : navItems;

  return (
    <aside
      data-tour="side-nav"
      className={`order-2 shrink-0 sticky top-16 self-start h-[calc(100svh-4rem)] border-l border-ink-500/10 dark:border-white/8 bg-[#EFE9D9]/80 dark:bg-surface-dark backdrop-blur-md overflow-y-auto transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
      aria-label="Primary navigation"
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={`flex items-center w-full gap-2 px-2 lg:px-3 py-3 border-b border-ink-500/10 dark:border-white/8 text-ink-500 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/8 hover:text-ink-900 dark:hover:text-white transition-colors ${
          collapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        <LayoutGrid size={18} strokeWidth={2.1} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left text-fluid-xs font-semibold truncate">Workspaces</span>
            <ChevronRight size={16} className="shrink-0" />
          </>
        )}
      </button>

      <nav className="flex flex-col gap-1 p-2 lg:p-3">
        {items.map(({ to, label, icon: Icon, end, tourId }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            data-tour={tourId}
            title={label}
            aria-label={label}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-2.5 lg:px-3 py-2.5 text-fluid-sm font-medium transition-colors ${
                collapsed ? 'justify-center' : 'justify-start'
              } ${
                isActive
                  ? 'bg-brand-700 text-white shadow-[0_2px_8px_-3px_rgba(10,74,56,0.5)]'
                  : 'text-ink-500 dark:text-ink-300 hover:bg-brand-500/10 dark:hover:bg-white/8 hover:text-brand-700 dark:hover:text-white'
              }`
            }
          >
            <Icon size={18} strokeWidth={2.1} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
