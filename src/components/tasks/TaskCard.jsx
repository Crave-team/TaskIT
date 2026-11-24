import { CalendarDays, GripVertical, Paperclip } from 'lucide-react';
import Badge from '../common/Badge';
import ProgressBar from '../common/ProgressBar';
import { PRIORITY_META, todayISO } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';

function formatDate(dateOnly) {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Compact draggable card representing a single task inside a Kanban column.
 * Click opens the edit modal; native HTML5 drag-and-drop reassigns status.
 *
 * @param {{ task: import('../../types').Task, onClick: () => void, onDragStart: (e: React.DragEvent) => void }} props
 */
export default function TaskCard({ task, onClick, onDragStart }) {
  const { taskProgress, timers } = useTasks();
  return (
    <TaskCardView
      task={task}
      progress={taskProgress(task)}
      timerRunning={Boolean(timers[task.id])}
      onClick={onClick}
      onDragStart={onDragStart}
    />
  );
}

/**
 * The pure visual of a task card (no context). The real Kanban board and
 * the homepage's feature previews both render this, so they always match.
 */
export function TaskCardView({ task, progress, timerRunning = false, onClick = () => {}, onDragStart }) {
  const isOverdue = task.status !== 'done' && task.dueDate < todayISO();

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className="group bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-3.5 cursor-pointer hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Badge tone={PRIORITY_META[task.priority].color}>{PRIORITY_META[task.priority].label}</Badge>
        <GripVertical size={14} className="text-ink-500/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      <h4 className="text-fluid-sm font-semibold text-ink-900 dark:text-white leading-snug mb-1.5">
        {task.title}
      </h4>

      {task.description && (
        <p className="text-fluid-xs text-ink-500 line-clamp-2 mb-3">{task.description}</p>
      )}

      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-fluid-xs text-brand-600 dark:text-brand-300 bg-brand-500/8 rounded px-1.5 py-0.5">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {(task.subtasks?.length > 0) && (
        <div className="mb-3">
          <ProgressBar value={progress} size="sm" />
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-ink-500/8 dark:border-white/8">
        <div className="flex items-center gap-2.5">
          <div className={`flex items-center gap-1 text-fluid-xs ${isOverdue ? 'text-coral-600 font-medium' : 'text-ink-500'}`}>
            <CalendarDays size={13} />
            {formatDate(task.dueDate)}
          </div>
          {timerRunning && (
            <span className="relative flex w-2 h-2" title="Timer running">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-60 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-brand-600" />
            </span>
          )}
          {task.attachments?.length > 0 && (
            <div className="flex items-center gap-0.5 text-fluid-xs text-ink-500">
              <Paperclip size={12} /> {task.attachments.length}
            </div>
          )}
        </div>
        <div
          className="w-6 h-6 rounded-full bg-ink-500/10 dark:bg-white/10 flex items-center justify-center text-[10px] font-semibold text-ink-700 dark:text-ink-300"
          title={task.assignee}
        >
          {task.assignee.split(' ').map((n) => n[0]).join('').slice(0, 2)}
        </div>
      </div>
    </div>
  );
}
