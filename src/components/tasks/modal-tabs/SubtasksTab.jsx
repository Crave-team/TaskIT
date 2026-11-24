import { usePersistedState } from '../../../hooks/usePersistedState';
import { Plus, X, ListTodo } from 'lucide-react';
import ProgressBar from '../../common/ProgressBar';

/**
 * Checklist of subtasks belonging to a task, with progress rollup and
 * inline add/toggle/remove — the "subtasks" piece of PPT Task Management.
 *
 * Works on either a saved task or a not-yet-created draft: the parent hands in an `api`
 * with the current subtasks and the add/toggle/remove actions.
 *
 * @param {{ api: ReturnType<typeof import('../useTaskEditor').default>['api'] }} props
 */
export default function SubtasksTab({ api }) {
  const { subtasks, addSubtask, toggleSubtask, removeSubtask } = api;
  const [title, setTitle] = usePersistedState('taskEditor.subtaskTitle', '');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    addSubtask(title.trim());
    setTitle('');
  };

  const progress = subtasks.length ? Math.round((subtasks.filter((s) => s.done).length / subtasks.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {subtasks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-fluid-xs font-medium text-ink-700 dark:text-ink-300">
              {subtasks.filter((s) => s.done).length} of {subtasks.length} complete
            </span>
          </div>
          <ProgressBar value={progress} showLabel />
        </div>
      )}

      {subtasks.length === 0 ? (
        <div className="flex flex-col items-center text-center py-6 text-ink-500">
          <ListTodo size={22} className="mb-2 opacity-60" />
          <p className="text-fluid-sm">Break this task into smaller steps.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {subtasks.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2.5 group rounded-lg px-2 py-1.5 hover:bg-ink-500/5 dark:hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => toggleSubtask(s.id)}
                className="w-4 h-4 rounded accent-brand-600 shrink-0"
                aria-label={`Mark "${s.title}" ${s.done ? 'incomplete' : 'complete'}`}
              />
              <span className={`flex-1 text-fluid-sm ${s.done ? 'line-through text-ink-500' : 'text-ink-900 dark:text-white'}`}>
                {s.title}
              </span>
              <button
                type="button"
                onClick={() => removeSubtask(s.id)}
                aria-label={`Remove "${s.title}"`}
                className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-coral-600 transition-opacity shrink-0"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a subtask…"
          className="flex-1 text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 flex items-center gap-1 text-fluid-xs font-medium bg-brand-600 text-white rounded-lg px-3 hover:bg-brand-700 transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </form>
    </div>
  );
}
