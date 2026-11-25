import { usePersistedState } from '../../hooks/usePersistedState';
import { ArrowLeft, FolderKanban, ChevronRight } from 'lucide-react';
import EmptyState from '../common/EmptyState';
import Tabs from '../common/Tabs';
import MemberTasksView from './MemberTasksView';
import AuditTrailView from './AuditTrailView';
import CreateTasksView from './CreateTasksView';
import { TeamIcon, panelClass } from './shared';
import { useTasks } from '../../context/TaskContext';

/**
 * Admin-only. Step 1: pick one of the team's existing projects. Step 2: work
 * inside it — see every member's tasks (and swap/drag them), read the audit
 * trail of progress and turned-in files, or create + assign a batch of tasks.
 */
export default function AssignTaskTab({ group, members }) {
  const { allProjects, allTasks: tasks } = useTasks();
  const [openId, setOpenId] = usePersistedState(`team.${group.id}.assign.openId`, null);
  const [sub, setSub] = usePersistedState(`team.${group.id}.assign.sub`, 'members');

  const projects = allProjects.filter((p) => p.groupId === group.id && !p.archived);
  const project = projects.find((p) => p.id === openId) || null;

  if (!project) {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">Assign task</p>
          <p className="text-fluid-xs text-ink-500">Pick a project to assign tasks, manage who has what, and check progress.</p>
        </div>
        {projects.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No projects to assign tasks in" description="Create a project in the Projects tab first." />
        ) : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {projects.map((p) => {
              const pt = tasks.filter((t) => t.projectId === p.id);
              const done = pt.filter((t) => t.status === 'done').length;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => { setOpenId(p.id); setSub('members'); }}
                    className={`${panelClass} w-full flex items-center gap-3 p-4 text-left hover:shadow-elevated transition-shadow`}
                  >
                    <TeamIcon id={p.id} name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-fluid-sm font-semibold text-ink-900 dark:text-white truncate">{p.name}</span>
                      <span className="block text-fluid-xs text-ink-500">{pt.length} task{pt.length === 1 ? '' : 's'} · {done} turned in</span>
                    </span>
                    <ChevronRight size={16} className="text-ink-500 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-2 rounded-full border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-darkcard shadow-soft px-3.5 py-1.5 text-fluid-xs font-medium text-ink-700 dark:text-ink-300 hover:bg-ink-500/5 transition-colors"
        >
          <ArrowLeft size={14} /> All projects
        </button>
        <h3 className="font-display font-bold text-fluid-lg text-ink-900 dark:text-white">{project.name}</h3>
      </div>

      <Tabs
        tabs={[
          { key: 'members', label: 'Member tasks' },
          { key: 'audit', label: 'Audit trail' },
          { key: 'create', label: 'Create & assign' },
        ]}
        active={sub}
        onChange={setSub}
      />

      {sub === 'members' && <MemberTasksView project={project} members={members} />}
      {sub === 'audit' && <AuditTrailView project={project} members={members} />}
      {sub === 'create' && <CreateTasksView group={group} project={project} members={members} />}
    </div>
  );
}
