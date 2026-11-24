import { Flag, ListChecks, Pencil } from 'lucide-react';
import Badge from '../common/Badge';
import ProgressBar from '../common/ProgressBar';
import { PROJECT_STATUS_META } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';

const colorDot = { brand: 'bg-brand-500', coral: 'bg-coral-500', sage: 'bg-sage-500', amber: 'bg-amber-500' };

/**
 * Summary card for a single project: status badge, progress bar (derived
 * from task completion), member avatars, and next milestone.
 *
 * Clicking the card opens that project's tasks; the pencil edits the project.
 *
 * @param {{ project: import('../../types').Project, onEdit: () => void, onViewTasks: () => void, canEdit?: boolean }} props
 */
export default function ProjectCard({ project, onEdit, onViewTasks, canEdit = true }) {
  const { allTasks, projectProgress } = useTasks();
  const taskCount = allTasks.filter((t) => t.projectId === project.id).length;
  return (
    <ProjectCardView
      project={project}
      progress={projectProgress(project.id)}
      taskCount={taskCount}
      onEdit={onEdit}
      onViewTasks={onViewTasks}
      canEdit={canEdit}
    />
  );
}

/**
 * Pure visual of a project card (no context). Shared by the real Projects
 * view and the homepage's feature previews so the two always match.
 */
export function ProjectCardView({ project, progress, taskCount, onEdit = () => {}, onViewTasks = () => {}, canEdit = true }) {
  const projectTasks = { length: taskCount };
  const statusMeta = PROJECT_STATUS_META[project.status] || PROJECT_STATUS_META.planning;
  const nextMilestone = (project.milestones || [])
    .filter((m) => !m.done)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onViewTasks}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onViewTasks())}
      aria-label={`Open tasks for ${project.name}`}
      className="group/card cursor-pointer text-left w-full bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-5 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-150"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorDot[project.color] || colorDot.brand}`} />
          <h3 className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white truncate">
            {project.name}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
          {canEdit && <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label={`Edit ${project.name}`}
            title="Edit project"
            className="p-1.5 rounded-lg text-ink-500 hover:text-ink-900 dark:hover:text-white hover:bg-ink-500/10 dark:hover:bg-white/10 transition-colors"
          >
            <Pencil size={14} />
          </button>}
        </div>
      </div>

      {project.description && (
        <p className="text-fluid-xs text-ink-500 line-clamp-2 mb-4">{project.description}</p>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-fluid-xs text-ink-500">Progress</span>
          <span className="text-fluid-xs font-medium text-ink-700 dark:text-ink-300">{progress}%</span>
        </div>
        <ProgressBar value={progress} tone={project.color === 'coral' ? 'coral' : project.color === 'amber' ? 'amber' : project.color === 'sage' ? 'sage' : 'brand'} />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-ink-500/8 dark:border-white/8">
        <div className="flex items-center gap-1.5 text-fluid-xs text-ink-500">
          <ListChecks size={13} />
          {projectTasks.length} task{projectTasks.length === 1 ? '' : 's'}
        </div>
        {nextMilestone ? (
          <div className="flex items-center gap-1.5 text-fluid-xs text-ink-500">
            <Flag size={13} />
            {nextMilestone.title}
          </div>
        ) : (
          <div className="text-fluid-xs text-ink-500">No upcoming milestone</div>
        )}
      </div>
    </div>
  );
}
