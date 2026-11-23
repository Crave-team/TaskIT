import { useEffect, useRef, useState } from 'react';
import {
  Search, Bell, LayoutDashboard, KanbanSquare, CalendarDays, Users,
} from 'lucide-react';
import { LogoMark } from '../../common/Logo';
import PageHeaderCard from '../../layout/PageHeaderCard';

/**
 * Windows-style caption buttons (minimise / maximise / close) drawn with the
 * same thin 10px glyphs Windows 11 uses.
 */
function CaptionButtons() {
  const btn = 'w-[46px] h-8 flex items-center justify-center text-ink-700 dark:text-ink-300';
  return (
    <div className="flex items-stretch shrink-0 -mr-px">
      <span className={btn}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M0 5.5h10" /></svg>
      </span>
      <span className={btn}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" rx="1" /></svg>
      </span>
      <span className={`${btn} hover:bg-[#C42B1C] hover:text-white rounded-tr-lg`}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><path d="M0 0l10 10M10 0 0 10" /></svg>
      </span>
    </div>
  );
}

/** Title bar: app icon + title on the left, Windows caption buttons on the right. */
export function WinTitleBar({ title }) {
  return (
    <div className="h-8 flex items-center justify-between pl-3 bg-[#E4DDC8] dark:bg-[#101317] border-b border-ink-500/10 dark:border-white/10 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <LogoMark size={15} />
        <span className="text-[12px] text-ink-700 dark:text-ink-300 truncate">{title}</span>
      </div>
      <CaptionButtons />
    </div>
  );
}

const RAIL = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { key: 'tasks', icon: KanbanSquare, label: 'My Workspace' },
  { key: 'calendar', icon: CalendarDays, label: 'Calendar' },
  { key: 'team', icon: Users, label: 'Team' },
];

/**
 * Scales a fixed-size "design canvas" down to whatever width it is given,
 * so previews keep the real app's proportions at any screen size.
 */
export function ScaleToFit({ designWidth, designHeight, children, className = '' }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setScale(el.clientWidth / designWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div
      ref={ref}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: designHeight * scale }}
    >
      <div
        style={{ width: designWidth, height: designHeight, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        className="absolute top-0 left-0"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A faithful miniature of the TaskIT app inside a Windows-style window:
 * the real top bar layout (logo, search, bell, avatar), the real page
 * header card, and the real right-hand navigation rail with the current
 * section highlighted.
 *
 * @param {{ title: string, active: string, pageTitle: string, subtitle?: string, action?: React.ReactNode, children: React.ReactNode }} props
 */
export default function AppWindow({ title = 'TaskIT', active, pageTitle, subtitle, action, children }) {
  return (
    <div inert className="w-full h-full flex flex-col rounded-lg border border-ink-500/20 dark:border-white/10 shadow-elevated overflow-hidden bg-[#E9E2D0] dark:bg-surface-dark select-none pointer-events-none">
      <WinTitleBar title={`${title} — TaskIT`} />

      {/* app top bar (mirrors IconTopNav) */}
      <div className="h-14 flex items-center justify-between gap-3 px-4 bg-[#EFE9D9] dark:bg-surface-dark border-b border-ink-500/10 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <LogoMark size={30} />
          <span className="font-display font-extrabold tracking-tight text-fluid-xl text-ink-900 dark:text-white">
            Task<span className="text-brand-600 dark:text-brand-300">IT</span>
          </span>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 text-ink-500 bg-ink-500/5 dark:bg-white/5 border border-ink-500/10 dark:border-white/10 rounded-full px-3.5 py-2 w-full max-w-md">
            <Search size={15} />
            <span className="text-fluid-xs">Search tasks, projects, pages…</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="relative p-2.5 text-ink-500 dark:text-ink-300">
            <Bell size={18} />
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">3</span>
          </span>
          <span className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold text-[15px]">AR</span>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 min-w-0 overflow-hidden px-6 pt-5">
          <PageHeaderCard title={pageTitle} subtitle={subtitle} action={action} />
          {children}
        </main>
        {/* right-hand rail (mirrors SideNav, collapsed) */}
        <aside className="w-16 shrink-0 border-l border-ink-500/10 dark:border-white/10 bg-[#EFE9D9]/80 dark:bg-surface-dark">
          <div className="h-[49px] border-b border-ink-500/10 dark:border-white/10" />
          <nav className="flex flex-col gap-1 p-2">
            {RAIL.map(({ key, icon: Icon, label }) => (
              <span
                key={key}
                title={label}
                className={`flex items-center justify-center rounded-xl py-2.5 ${
                  key === active
                    ? 'bg-brand-700 text-white shadow-[0_2px_8px_-3px_rgba(10,74,56,0.5)]'
                    : 'text-ink-500 dark:text-ink-300'
                }`}
              >
                <Icon size={18} strokeWidth={2.1} />
              </span>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}
