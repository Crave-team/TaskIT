import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, KanbanSquare, FolderKanban, CalendarDays, Users, Sparkles, Check } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';

const DISMISS_KEY = 'taskit_getting_started_dismissed';

/**
 * A friendly first-look checklist so a brand-new visitor immediately knows
 * where things are: Task Workspace, Projects, Calendar, Team. Each item
 * auto-completes once the workspace already has that kind of content, and
 * the whole card can be dismissed (remembered in localStorage).
 */
export default function GettingStarted() {
  const { personalTasks: tasks, projects } = useTasks();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const steps = [
    {
      icon: KanbanSquare,
      title: 'Explore the Task Workspace',
      description: 'See every task as a Kanban board or list, and drag cards between columns.',
      to: '/tasks',
      done: tasks.length > 0,
    },
    {
      icon: FolderKanban,
      title: 'Check out Projects',
      description: 'Group tasks by project, track progress, and set milestones.',
      to: '/tasks',
      done: projects.length > 0,
    },
    {
      icon: CalendarDays,
      title: 'Open the Calendar',
      description: 'See deadlines and milestones by day, week, or month.',
      to: '/calendar',
      done: false,
    },
    {
      icon: Users,
      title: 'Visit Team',
      description: 'Chat with your teams, work on shared projects, and turn in tasks.',
      to: '/team',
      done: false,
    },
  ];

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="relative bg-gradient-to-br from-brand-500/10 to-brand-500/[0.03] border border-brand-500/20 rounded-xl p-5">
      <button
        onClick={dismiss}
        aria-label="Dismiss getting started"
        className="absolute top-3 right-3 p-1.5 rounded-lg text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
      >
        <X size={15} />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={17} className="text-brand-600" />
        <h2 className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white">
          New here? A quick look around
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((step) => (
          <Link
            key={step.title}
            to={step.to}
            className="flex flex-col gap-2 bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-lg p-3.5 hover:shadow-soft hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                <step.icon size={15} className="text-brand-600" />
              </div>
              {step.done && (
                <span className="w-5 h-5 rounded-full bg-sage-500/15 text-sage-600 flex items-center justify-center">
                  <Check size={12} />
                </span>
              )}
            </div>
            <div>
              <p className="text-fluid-sm font-medium text-ink-900 dark:text-white">{step.title}</p>
              <p className="text-fluid-xs text-ink-500 mt-0.5">{step.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
