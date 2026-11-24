import { Search, X, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';
import { STATUS_META, PRIORITY_META } from '../../data/mockData';

/**
 * Search box plus contextual dropdown filters (priority, status, tag, due
 * date window) and the Kanban/List view switcher. Kept in a single compact
 * row so the workspace above it stays uncluttered.
 *
 * @param {{ view: 'kanban'|'list', onViewChange: (v: 'kanban'|'list') => void }} props
 */
export default function FilterBar({ view, onViewChange, hideProject = false }) {
  const { filters, setFilter, resetFilters, allTags, allAssignees, projects } = useTasks();
  const hasActiveFilters =
    filters.priority || filters.status || filters.tag || (!hideProject && (filters.assignee || filters.projectId)) || filters.dueWithin || filters.search;

  const selectClass =
    'text-fluid-sm bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 rounded-lg pl-2.5 pr-7 py-2 text-ink-900 dark:text-white focus:outline-none';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="relative flex-1 min-w-[180px]">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <input
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          placeholder="Search tasks, tags, descriptions…"
          className="w-full text-fluid-sm bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.priority}
          onChange={(e) => setFilter('priority', e.target.value)}
          className={selectClass}
          aria-label="Filter by priority"
        >
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label} priority</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>

        <select
          value={filters.tag}
          onChange={(e) => setFilter('tag', e.target.value)}
          className={selectClass}
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>#{tag}</option>
          ))}
        </select>

        {!hideProject && (
          <select
            value={filters.projectId}
            onChange={(e) => setFilter('projectId', e.target.value)}
            className={selectClass}
            aria-label="Filter by project"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {!hideProject && (
          <select
            value={filters.assignee}
            onChange={(e) => setFilter('assignee', e.target.value)}
            className={selectClass}
            aria-label="Filter by assignee"
          >
            <option value="">All assignees</option>
            {allAssignees.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}

        <select
          value={filters.dueWithin}
          onChange={(e) => setFilter('dueWithin', e.target.value)}
          className={selectClass}
          aria-label="Filter by due date"
        >
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="7">Due in 7 days</option>
          <option value="30">Due in 30 days</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 text-fluid-xs text-ink-500 hover:text-ink-900 dark:hover:text-white px-2 py-1"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="flex items-center bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 shadow-soft rounded-lg p-1 self-start sm:self-auto">
        <button
          onClick={() => onViewChange('kanban')}
          aria-pressed={view === 'kanban'}
          aria-label="Kanban view"
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-fluid-xs font-medium transition-colors ${
            view === 'kanban'
              ? 'bg-brand-700 text-white'
              : 'text-ink-500 hover:bg-ink-500/8 dark:hover:bg-white/5'
          }`}
        >
          <LayoutGrid size={15} /> Kanban
        </button>
        <button
          onClick={() => onViewChange('list')}
          aria-pressed={view === 'list'}
          aria-label="List view"
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-fluid-xs font-medium transition-colors ${
            view === 'list'
              ? 'bg-brand-700 text-white'
              : 'text-ink-500 hover:bg-ink-500/8 dark:hover:bg-white/5'
          }`}
        >
          <ListIcon size={15} /> List
        </button>
      </div>
    </div>
  );
}
