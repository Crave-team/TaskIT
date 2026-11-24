import { usePersistedState } from '../../hooks/usePersistedState';
import { Plus, LayoutGrid, GanttChartSquare, Archive } from 'lucide-react';
import Button from '../common/Button';
import EmptyState from '../common/EmptyState';
import ProjectCard from './ProjectCard';
import ProjectModal from './ProjectModal';
import GanttChart from './GanttChart';
import { useTasks } from '../../context/TaskContext';
import { FolderKanban } from 'lucide-react';

/**
 * Projects level of the Task Workspace: create/edit/archive/delete projects,
 * see each project's status and progress, switch to a Gantt timeline, and
 * jump straight to a project's tasks via `onViewTasks(projectId)`.
 *
 * @param {{ onViewTasks: (projectId: string) => void }} props
 */
export default function ProjectsView({ onViewTasks }) {
  const { projects, allProjects, tasks } = useTasks();
  const [view, setView] = usePersistedState('projects.view', 'grid');
  const [showArchived, setShowArchived] = usePersistedState('projects.showArchived', false);
  const [modalOpen, setModalOpen] = usePersistedState('projects.modalOpen', false);
  const [editingProjectId, setEditingProjectId] = usePersistedState('projects.editingId', null);
  const editingProject = editingProjectId ? allProjects.find((p) => p.id === editingProjectId && !p.groupId) || null : null;
  const projectWindowOpen = modalOpen && (!editingProjectId || Boolean(editingProject));

  const visibleProjects = showArchived ? allProjects.filter((p) => p.archived && !p.groupId) : projects;
  const visibleTasks = tasks.filter((t) => visibleProjects.some((p) => p.id === t.projectId));

  const openCreate = () => {
    setEditingProjectId(null);
    setModalOpen(true);
  };
  const openEdit = (project) => {
    setEditingProjectId(project.id);
    setModalOpen(true);
  };

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div data-tour="projects-view" className="flex items-center bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 shadow-soft rounded-lg p-1">
              <button
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-fluid-xs font-medium transition-colors ${
                  view === 'grid' ? 'bg-brand-700 text-white' : 'text-ink-500 hover:bg-ink-500/8 dark:hover:bg-white/5'
                }`}
              >
                <LayoutGrid size={15} /> Grid
              </button>
              <button
                onClick={() => setView('gantt')}
                aria-pressed={view === 'gantt'}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-fluid-xs font-medium transition-colors ${
                  view === 'gantt' ? 'bg-brand-700 text-white' : 'text-ink-500 hover:bg-ink-500/8 dark:hover:bg-white/5'
                }`}
              >
                <GanttChartSquare size={15} /> Gantt
              </button>
            </div>
            <button
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-fluid-xs font-medium border transition-colors ${
                showArchived
                  ? 'bg-ink-500/10 border-ink-500/20 text-ink-900 dark:text-white'
                  : 'border-ink-500/15 dark:border-white/10 text-ink-500 hover:bg-ink-500/5 dark:hover:bg-white/5'
              }`}
            >
              <Archive size={14} /> {showArchived ? 'Viewing archived' : 'Show archived'}
            </button>
          </div>
          <Button data-tour="new-project" variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
            New project
          </Button>
        </div>

        {visibleProjects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={showArchived ? 'No archived projects' : 'Create your first project'}
            description={showArchived ? 'Archived projects will show up here.' : 'Projects group related tasks together and track overall progress, status, and milestones.'}
            action={!showArchived && (
              <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={openCreate}>
                New project
              </Button>
            )}
          />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onEdit={() => openEdit(p)} onViewTasks={() => onViewTasks(p.id)} />
            ))}
          </div>
        ) : (
          <GanttChart tasks={visibleTasks} projects={visibleProjects} showAssignee={false} />
        )}
      </div>

      <ProjectModal open={projectWindowOpen} onClose={() => setModalOpen(false)} project={editingProject} />
    </>
  );
}
