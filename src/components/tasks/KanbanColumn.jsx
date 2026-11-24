import { useState } from 'react';
import { Plus } from 'lucide-react';
import TaskCard from './TaskCard';

/**
 * A single Kanban column (e.g. "To Do"). Accepts dropped task cards and
 * reports the moved task id back up via `onDropTask`.
 *
 * @param {{
 *   statusKey: string,
 *   label: string,
 *   tasks: import('../../types').Task[],
 *   onCardClick: (task: import('../../types').Task) => void,
 *   onAddClick: () => void,
 *   onDropTask: (taskId: string, status: string) => void,
 * }} props
 */
export default function KanbanColumn({ statusKey, label, tasks, onCardClick, onAddClick, onDropTask }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData('text/task-id');
    if (taskId) onDropTask(taskId, statusKey);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      className={`flex flex-col w-[280px] sm:w-[300px] shrink-0 rounded-xl p-2.5 border transition-colors ${
        isDragOver ? 'bg-brand-500/10 border-brand-500/30' : 'bg-ink-500/[0.04] border-ink-500/[0.06] dark:bg-transparent dark:border-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-semibold text-fluid-sm text-ink-900 dark:text-white">{label}</h3>
          <span className="text-fluid-xs text-ink-500 bg-ink-500/10 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onAddClick}
          aria-label={`Add task to ${label}`}
          className="p-1 rounded-md text-ink-500 hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 min-h-[120px] pb-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onCardClick(task)}
            onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="border border-dashed border-ink-500/20 dark:border-white/15 rounded-xl py-8 text-center text-fluid-xs text-ink-500">
            Drop a task here
          </div>
        )}
      </div>
    </div>
  );
}
