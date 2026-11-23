import { CalendarClock } from 'lucide-react';
import Badge from '../common/Badge';
import { PRIORITY_META } from '../../data/mockData';

/** Formats an ISO date as a short, readable label like "Sep 8". */
function formatDate(dateOnly) {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Returns a human relative-day phrase, e.g. "Today", "In 3 days", "2 days overdue". */
function relativeDay(dateOnly) {
  const due = new Date(`${dateOnly}T00:00:00`);
  const now = new Date(new Date().toDateString());
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1) return `In ${diff} days`;
  return `${Math.abs(diff)} day${Math.abs(diff) > 1 ? 's' : ''} overdue`;
}

/**
 * Shows the next handful of upcoming (non-done) task deadlines, soonest first.
 * @param {{ tasks: import('../../types').Task[] }} props
 */
export default function UpcomingDeadlines({ tasks }) {
  const upcoming = tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 5);

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-5 shadow-soft h-full">
      <h3 className="font-display font-semibold text-fluid-lg text-ink-900 dark:text-white mb-1">
        Upcoming deadlines
      </h3>
      <p className="text-fluid-xs text-ink-500 mb-4">Soonest due dates across open tasks</p>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-ink-500">
          <CalendarClock size={28} className="mb-2 opacity-60" />
          <p className="text-fluid-sm">Nothing on the horizon. Add a due date to see it here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {upcoming.map((t) => {
            const overdue = relativeDay(t.dueDate).includes('overdue');
            return (
              <li key={t.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">
                    {t.title}
                  </p>
                  <p className={`text-fluid-xs ${overdue ? 'text-coral-600 font-medium' : 'text-ink-500'}`}>
                    {formatDate(t.dueDate)} · {relativeDay(t.dueDate)}
                  </p>
                </div>
                <Badge tone={PRIORITY_META[t.priority].color}>{PRIORITY_META[t.priority].label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
