import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Plus, ArrowLeft, FolderKanban, Archive, LayoutGrid, GanttChartSquare } from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import EmptyState from '../common/EmptyState';
import ProjectCard from '../projects/ProjectCard';
import ProjectModal from '../projects/ProjectModal';
import GanttChart from '../projects/GanttChart';
import TeamKanban from './TeamKanban';
import TeamTaskModal from './TeamTaskModal';
import TurnInModal from './TurnInModal';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';
import { PROJECT_STATUS_META } from '../../data/mockData';

const toggleBtn = (active) =>
  `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-fluid-xs font-medium transition-colors ${
    active ? 'bg-brand-700 text-white' : 'text-ink-500 hover:bg-ink-500/8 dark:hover:bg-white/5'
  }`;

/**
 * Projects tab. Everyone in the team sees the team's projects (as cards or on a Gantt
 * timeline); only a group admin can create or edit them. Opening a project shows *your
 * own* tasks for it as a board — members never see each other's tasks, and cannot create
 * tasks: the admin assigns them from the Assign task tab. The Gantt shows every task to
 * a group admin, and only your own to a member.
 */
export default function TeamProjectsTab({ group, isAdmin }) {
  const { allProjects, allTasks, undoTurnIn } = useTasks();
  const { currentUser } = useAuth();
  // Which project is open, the views and every window here survive a refresh (kept per team).
  const scope = `team.${group.id}.projects`;
  const [openId, setOpenId] = usePersistedState(`${scope}.openId`, null);
  const [view, setView] = usePersistedState(`${scope}.view`, 'grid');
  const [showArchived, setShowArchived] = usePersistedState(`${scope}.showArchived`, false);
  const [modalOpen, setModalOpen] = usePersistedState(`${scope}.modalOpen`, false);
  const [editingId, setEditingId] = usePersistedState(`${scope}.editingId`, null);
  const [detailId, setDetailId] = usePersistedState(`${scope}.detailId`, null);
  const [turnInId, setTurnInId] = usePersistedState(`${scope}.turnInId`, null);

  const teamProjects = allProjects.filter((p) => p.groupId === group.id);

  // Deep link from search: `?project=<id>` opens that project's board, `&task=<id>` also opens that task.
  // The two parameters are used once and then removed, so a refresh or the back button behaves normally.
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedProject = searchParams.get('project');
  const linkedTask = searchParams.get('task');
  useEffect(() => {
    if (!linkedProject && !linkedTask) return;
    if (linkedProject && allProjects.some((p) => p.id === linkedProject && p.groupId === group.id)) {
      setView('grid');
      setOpenId(linkedProject);
    }
    if (linkedTask && allTasks.some((t) => t.id === linkedTask && t.groupId === group.id)) setDetailId(linkedTask);
    const next = new URLSearchParams(searchParams);
    next.delete('project');
    next.delete('task');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedProject, linkedTask]);
  const visible = teamProjects.filter((p) => (showArchived ? p.archived : !p.archived));
  const project = teamProjects.find((p) => p.id === openId) || null;
  const editing = editingId ? teamProjects.find((p) => p.id === editingId) || null : null;
  const projectWindowOpen = modalOpen && (!editingId || Boolean(editing));
  const teamTasks = allTasks.filter((t) => t.groupId === group.id);
  const myTasks = project ? teamTasks.filter((t) => t.projectId === project.id && t.assigneeId === currentUser.id) : [];
  const ganttTasks = teamTasks.filter((t) => visible.some((p) => p.id === t.projectId) && (isAdmin || t.assigneeId === currentUser.id));
  const detailTask = allTasks.find((t) => t.id === detailId) || null;
  const turnInTask = allTasks.find((t) => t.id === turnInId) || null;

  const undo = (t) => undoTurnIn(t.id);

  const openCreate = () => { setEditingId(null); setModalOpen(true); };
  const openEdit = (p) => { setEditingId(p.id); setModalOpen(true); };

  if (project) {
    const status = PROJECT_STATUS_META[project.status] || PROJECT_STATUS_META.planning;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setOpenId(null)}
            className="inline-flex items-center gap-2 rounded-full border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-darkcard shadow-soft px-3.5 py-1.5 text-fluid-xs font-medium text-ink-700 dark:text-ink-300 hover:bg-ink-500/5 transition-colors"
          >
            <ArrowLeft size={14} /> All projects
          </button>
          <div className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {isAdmin && <Button size="sm" variant="secondary" onClick={() => openEdit(project)}>Edit project</Button>}
          </div>
        </div>

        <div>
          <h3 className="font-display font-bold text-fluid-lg text-ink-900 dark:text-white">{project.name}</h3>
          <p className="text-fluid-xs text-ink-500">
            Your tasks in this project. {isAdmin ? 'Create and assign tasks from the Assign task tab.' : 'Your group admin assigns tasks to you.'}
          </p>
        </div>

        {myTasks.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No tasks assigned to you yet" description="When your group admin assigns you a task in this project, it shows up here." />
        ) : (
          <TeamKanban
            tasks={myTasks}
            onOpen={(t) => setDetailId(t.id)}
            onTurnIn={(t) => setTurnInId(t.id)}
            onUndo={undo}
          />
        )}

        <TeamTaskModal
          open={Boolean(detailTask)}
          task={detailTask}
          onClose={() => setDetailId(null)}
          onTurnIn={(t) => { setDetailId(null); setTurnInId(t.id); }}
          onUndo={undo}
        />
        <TurnInModal open={Boolean(turnInTask)} task={turnInTask} onClose={() => setTurnInId(null)} />
        <ProjectModal open={projectWindowOpen} onClose={() => setModalOpen(false)} project={editing} groupId={group.id} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
            Projects <span className="text-ink-500 font-normal">({teamProjects.filter((p) => !p.archived).length})</span>
          </p>
          <div data-tour="team-project-views" className="flex items-center bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 shadow-soft rounded-lg p-1">
            <button onClick={() => setView('grid')} aria-pressed={view === 'grid'} className={toggleBtn(view === 'grid')}><LayoutGrid size={14} /> Grid</button>
            <button onClick={() => setView('gantt')} aria-pressed={view === 'gantt'} className={toggleBtn(view === 'gantt')}><GanttChartSquare size={14} /> Gantt</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
          )}
          {isAdmin && <Button size="sm" icon={<Plus size={13} />} onClick={openCreate}>New project</Button>}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={showArchived ? 'No archived projects' : 'No projects yet'}
          description={isAdmin ? 'Create the first project for this team, then assign tasks to your members.' : 'Your group admin will create projects for this team.'}
          action={isAdmin && !showArchived && <Button size="sm" icon={<Plus size={15} />} onClick={openCreate}>New project</Button>}
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} canEdit={isAdmin} onEdit={() => openEdit(p)} onViewTasks={() => setOpenId(p.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-fluid-xs text-ink-500">
            {isAdmin ? 'Every member’s tasks, grouped by project.' : 'Your own tasks, grouped by project.'} Each bar runs from when the task was created to its due date.
          </p>
          <GanttChart tasks={ganttTasks} projects={visible} team />
        </div>
      )}

      <ProjectModal open={projectWindowOpen} onClose={() => setModalOpen(false)} project={editing} groupId={group.id} />
    </div>
  );
}
