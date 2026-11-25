import { useMemo } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { CheckCircle2, Clock, ClipboardCheck, CornerUpLeft } from 'lucide-react';
import Badge from '../common/Badge';
import ProgressBar from '../common/ProgressBar';
import Button from '../common/Button';
import { FileList } from '../common/FileViewer';
import TeamTaskModal from './TeamTaskModal';
import { Avatar, timeAgo, panelClass, TaskTimer } from './shared';
import { TEAM_STATUS_META as STATUS_META } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';

const fmtFull = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Admin audit trail for one project: each member's task progress, the files
 * they turned in (with the exact time they finished), and a running log of
 * who did what.
 */
export default function AuditTrailView({ project, members }) {
  const { allTasks: tasks, taskProgress, approveTask, returnTask } = useTasks();
  const [who, setWho] = usePersistedState(`audit.${project.id}.who`, 'all');
  const [detailId, setDetailId] = usePersistedState(`audit.${project.id}.detailId`, null);
  const detailTask = tasks.find((t) => t.id === detailId) || null;

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const people = members.filter((m) => who === 'all' || m.id === who);
  const unassigned = who === 'all' ? projectTasks.filter((t) => !t.assigneeId) : [];

  const events = useMemo(
    () =>
      projectTasks
        .filter((t) => who === 'all' || t.assigneeId === who)
        .flatMap((t) => (t.history || []).map((h) => ({ ...h, taskTitle: t.title })))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 30),
    [projectTasks, who]
  );

  const renderTask = (t) => {
    const done = t.status === 'done';
    const review = t.status === 'review';
    const submitted = (done || review) && t.turnIn;
    return (
      <li key={t.id} className="py-3 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-fluid-sm font-medium text-ink-900 dark:text-white">{t.title}</p>
          <Badge tone={done ? 'sage' : review ? 'amber' : t.status === 'in-progress' ? 'brand' : 'neutral'}>{STATUS_META[t.status].label}</Badge>
        </div>
        <div className="mt-1.5"><TaskTimer task={t} /></div>
        <div className="mt-2 max-w-xs"><ProgressBar value={taskProgress(t)} size="sm" /></div>

        {submitted && (
          <div className="mt-2.5 rounded-lg bg-brand-500/8 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-fluid-xs font-medium text-brand-700 dark:text-brand-300">
              <CheckCircle2 size={13} /> Turned in {fmtFull(t.turnIn.at)}
              {done && t.turnIn.approvedBy && <span className="text-ink-500 font-normal">· approved by {t.turnIn.approvedBy}</span>}
            </p>
            {t.turnIn.note && <p className="text-fluid-xs text-ink-700 dark:text-ink-300">“{t.turnIn.note}”</p>}
            <FileList files={t.turnIn.files} emptyText="No files were attached." />
            {review && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" icon={<CheckCircle2 size={13} />} onClick={() => approveTask(t.id)}>Approve</Button>
                <Button size="sm" variant="secondary" icon={<CornerUpLeft size={13} />} onClick={() => setDetailId(t.id)}>Return…</Button>
                <button onClick={() => setDetailId(t.id)} className="inline-flex items-center gap-1 text-fluid-xs font-medium text-ink-500 hover:text-brand-700">
                  <ClipboardCheck size={13} /> Open details
                </button>
              </div>
            )}
          </div>
        )}
        {t.returned && t.status === 'in-progress' && (
          <p className="mt-2 text-fluid-xs text-coral-600">Returned {timeAgo(t.returned.at)}{t.returned.note ? `: ${t.returned.note}` : ''}</p>
        )}
        {!submitted && !t.returned && <p className="mt-2 text-fluid-xs text-ink-500">Not turned in yet.</p>}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-fluid-xs text-ink-500">Progress, turned-in files and finish times for {project.name}.</p>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          aria-label="Filter by member"
          className="text-fluid-sm bg-white dark:bg-surface-darkcard border border-ink-500/15 dark:border-white/10 rounded-lg pl-3 text-ink-900 dark:text-white focus:outline-none"
        >
          <option value="all">All members</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {projectTasks.length === 0 ? (
        <p className="text-fluid-sm text-ink-500 py-10 text-center">No tasks yet, so there's nothing to audit.</p>
      ) : (
        <>
          {people.map((m) => {
            const list = projectTasks.filter((t) => t.assigneeId === m.id);
            const doneCount = list.filter((t) => t.status === 'done').length;
            return (
              <section key={m.id} className={`${panelClass} p-4`}>
                <div className="flex items-center gap-3 mb-3">
                  <Avatar id={m.id} name={m.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white truncate">{m.name}</p>
                    <p className="text-fluid-xs text-ink-500">{doneCount} of {list.length} approved</p>
                  </div>
                </div>
                {list.length === 0 ? (
                  <p className="text-fluid-xs text-ink-500">No tasks assigned.</p>
                ) : (
                  <ul className="divide-y divide-ink-500/10 dark:divide-white/10">{list.map(renderTask)}</ul>
                )}
              </section>
            );
          })}

          {unassigned.length > 0 && (
            <section className={`${panelClass} p-4`}>
              <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white mb-3">Unassigned</p>
              <ul className="divide-y divide-ink-500/10 dark:divide-white/10">{unassigned.map(renderTask)}</ul>
            </section>
          )}

          <section className={`${panelClass} p-4`}>
            <p className="flex items-center gap-2 text-fluid-sm font-semibold text-ink-900 dark:text-white mb-3">
              <Clock size={15} className="text-brand-600" /> Activity log
            </p>
            {events.length === 0 ? (
              <p className="text-fluid-xs text-ink-500">No activity yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {events.map((e) => (
                  <li key={e.id} className="text-fluid-sm text-ink-900 dark:text-white">
                    <span className="font-medium">{e.by}</span> <span className="text-ink-700 dark:text-ink-300">{e.detail.charAt(0).toLowerCase() + e.detail.slice(1)}</span>{' '}
                    <span className="text-ink-500">on “{e.taskTitle}” · {timeAgo(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    <TeamTaskModal
        open={Boolean(detailTask)}
        task={detailTask}
        onClose={() => setDetailId(null)}
        canReview
        onApprove={(t) => approveTask(t.id)}
        onReturn={(t, reason) => returnTask(t.id, reason)}
      />
    </div>
  );
}
