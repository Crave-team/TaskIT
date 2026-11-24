import { CalendarDays } from 'lucide-react';
import Badge from '../common/Badge';
import { PRIORITY_META, STATUS_META, todayISO } from '../../data/mockData';

function formatDate(dateOnly) {
  // Anchor to local midnight instead of letting the Date constructor parse
  // a bare "YYYY-MM-DD" as UTC, which can shift the displayed day by one.
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusTone = {
  todo: 'neutral',
  'in-progress': 'brand',
  review: 'amber',
  done: 'sage',
};

/**
 * Dense itemized list view of tasks, an alternative to the Kanban board for
 * scanning many tasks at once.
 *
 * @param {{ tasks: import('../../types').Task[], onRowClick: (task: import('../../types').Task) => void }} props
 */
export default function TaskListView({ tasks, onRowClick }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-16 text-ink-500">
        <p className="text-fluid-sm">No tasks match your filters.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-soft rounded-xl overflow-hidden">
      <div className="hidden sm:grid grid-cols-[1fr_100px_120px_140px_110px] gap-3 px-4 py-2.5 border-b border-ink-500/10 dark:border-white/10 text-fluid-xs font-semibold text-ink-500 uppercase tracking-wide">
        <span>Task</span>
        <span>Priority</span>
        <span>Status</span>
        <span>Due date</span>
        <span>Assignee</span>
      </div>
      <ul className="divide-y divide-ink-500/8 dark:divide-white/8">
        {tasks.map((task) => {
          const isOverdue = task.status !== 'done' && task.dueDate < todayISO();
          return (
            <li key={task.id}>
              <button
                onClick={() => onRowClick(task)}
                className="w-full text-left grid grid-cols-1 sm:grid-cols-[1fr_100px_120px_140px_110px] gap-1.5 sm:gap-3 sm:items-center px-4 py-3 hover:bg-ink-500/5 dark:hover:bg-white/5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">{task.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1 sm:hidden">
                    <Badge tone={PRIORITY_META[task.priority].color}>{PRIORITY_META[task.priority].label}</Badge>
                    <Badge tone={statusTone[task.status]}>{STATUS_META[task.status].label}</Badge>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Badge tone={PRIORITY_META[task.priority].color}>{PRIORITY_META[task.priority].label}</Badge>
                </div>
                <div className="hidden sm:block">
                  <Badge tone={statusTone[task.status]}>{STATUS_META[task.status].label}</Badge>
                </div>
                <div className={`flex items-center gap-1.5 text-fluid-xs ${isOverdue ? 'text-coral-600 font-medium' : 'text-ink-500'}`}>
                  <CalendarDays size={13} />
                  {formatDate(task.dueDate)}
                  {isOverdue && <span className="hidden sm:inline">· overdue</span>}
                </div>
                <div className="text-fluid-xs text-ink-500 truncate">{task.assignee}</div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
