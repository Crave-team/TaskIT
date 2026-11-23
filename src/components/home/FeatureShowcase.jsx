import { useCallback, useEffect, useRef, useState } from 'react';
import { KanbanSquare, GanttChartSquare, CalendarDays, Users, BarChart3, Timer, ChevronDown } from 'lucide-react';
import {
  KanbanVisual, ProjectsVisual, CalendarVisual, TeamsVisual, ReportsVisual, TrackingVisual,
} from './FeatureVisuals';

const AUTO_MS = 6500;

const FEATURES = [
  {
    id: 'tasks', icon: KanbanSquare, title: 'Tasks & Kanban board',
    text: 'Drag tasks between To Do, In Progress, Review and Done. Add subtasks, priorities, tags, dependencies and repeats, then filter by anything.',
    Visual: KanbanVisual,
  },
  {
    id: 'projects', icon: GanttChartSquare, title: 'Projects & timeline',
    text: 'Group work into projects with statuses, members and milestones. Switch between a card grid and a Gantt timeline to see the whole plan.',
    Visual: ProjectsVisual,
  },
  {
    id: 'calendar', icon: CalendarDays, title: 'Calendar & deadlines',
    text: 'Every deadline and milestone on one month grid or a two-week agenda. Click any date to add a task, reminder or announcement.',
    Visual: CalendarVisual,
  },
  {
    id: 'teams', icon: Users, title: 'Team workspaces',
    text: 'Create or join teams, chat with your team, post announcements, assign tasks to members, and approve or return the work they turn in.',
    Visual: TeamsVisual,
  },
  {
    id: 'reports', icon: BarChart3, title: 'Team reports & Gantt',
    text: 'Every team gets its own charts — tasks by status and priority, workload per person, time logged per project — plus a Gantt timeline of its projects.',
    Visual: ReportsVisual,
  },
  {
    id: 'tracking', icon: Timer, title: 'Time, files & notifications',
    text: 'Start a timer on any task, attach files, and get alerts for assignments, deadlines and overdue work — with a pop-up warning when something slips.',
    Visual: TrackingVisual,
  },
];

/**
 * Interactive "what TaskIT can do" list. The active feature's description
 * unfolds with a height transition and its visual cross-fades in over the
 * previous one; the list advances by itself (with a progress bar) until the
 * visitor hovers, focuses or picks something.
 */
export default function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPicked, setUserPicked] = useState(false);
  const wrapRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = inView && !paused && !userPicked;

  useEffect(() => {
    if (!running) return undefined;
    const t = setTimeout(() => setActive((i) => (i + 1) % FEATURES.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [running, active]);

  const pick = useCallback((i) => {
    setActive(i);
    setUserPicked(true);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="grid lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] gap-6 lg:gap-10 items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* list */}
      <ul className="space-y-2.5 order-2 lg:order-1">
        {FEATURES.map((f, i) => {
          const on = i === active;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => pick(i)}
                aria-expanded={on}
                aria-controls={`feature-panel-${f.id}`}
                className={`group relative w-full text-left rounded-2xl border px-4 py-3.5 overflow-hidden transition-all duration-500 ease-smooth ${
                  on
                    ? 'bg-surface-card dark:bg-surface-darkcard border-brand-600/40 shadow-elevated'
                    : 'bg-transparent border-ink-500/10 dark:border-white/10 hover:bg-surface-card/70 dark:hover:bg-white/[0.04] hover:border-brand-600/25'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all duration-500 ease-smooth ${
                      on ? 'bg-brand-700 text-white scale-105' : 'bg-brand-500/10 text-brand-700 dark:text-brand-300 group-hover:bg-brand-500/20'
                    }`}
                  >
                    <f.icon size={19} />
                  </span>
                  <span className="flex-1 font-display font-bold text-fluid-base text-ink-900 dark:text-white">{f.title}</span>
                  <ChevronDown size={17} className={`text-ink-500 transition-transform duration-500 ease-smooth ${on ? 'rotate-180' : ''}`} />
                </span>

                {/* smooth height reveal */}
                <span
                  className={`grid transition-[grid-template-rows,opacity] duration-500 ease-smooth ${
                    on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <span className="overflow-hidden block">
                    <span className="block pt-2.5 pl-[3.25rem] text-fluid-sm text-ink-500 leading-relaxed">{f.text}</span>
                  </span>
                </span>

                {/* auto-advance progress */}
                {on && running && (
                  <span
                    key={`p-${active}`}
                    className="absolute left-0 bottom-0 h-[3px] bg-brand-500 animate-[progressFill_6500ms_linear_forwards]"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* visual stage */}
      <div className="order-1 lg:order-2 relative">
        <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-brand-500/15 via-transparent to-amber-500/15 blur-xl" aria-hidden="true" />
        <div className="relative grid">
          {FEATURES.map((f, i) => (
            <div
              key={f.id}
              id={`feature-panel-${f.id}`}
              role="region"
              aria-label={f.title}
              aria-hidden={i !== active}
              className={`col-start-1 row-start-1 transition-all duration-700 ease-smooth ${
                i === active
                  ? 'opacity-100 translate-y-0 scale-100'
                  : i < active
                    ? 'opacity-0 -translate-y-3 scale-[0.98] pointer-events-none'
                    : 'opacity-0 translate-y-3 scale-[0.98] pointer-events-none'
              }`}
            >
              <f.Visual />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
