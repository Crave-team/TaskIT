import { useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { CalendarDays, CheckCircle2, Lock, Hourglass, Trash2, CheckSquare, Square, X, ClipboardCheck, Paperclip } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import Modal from '../common/Modal';
import TeamTaskModal from './TeamTaskModal';
import { Avatar, TaskTimer } from './shared';
import { TEAM_STATUS_META, todayISO } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';

const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const UNASSIGNED = 'unassigned';
const STATUS_TONE = { todo: 'neutral', 'in-progress': 'brand', review: 'amber', done: 'sage' };

/**
 * Every member's tasks for one project — the admin's own included — one lane per person.
 *  - Drag a task to another lane to hand it over, or drop it on one of their tasks to swap
 *    (a menu on each card does the same). Tasks waiting for review or finished are locked.
 *  - Open a task in "To Review" to approve it or return it.
 *  - "Select" mode lets you tick some tasks (or a whole lane / everything) and delete them together.
 */
export default function MemberTasksView({ project, members }) {
  const { allTasks: tasks, reassignTask, swapTaskAssignees, approveTask, returnTask, deleteTasks } = useTasks();
  const { currentUser } = useAuth();
  const [overLane, setOverLane] = useState(null);
  const [overCard, setOverCard] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailId, setDetailId] = usePersistedState(`projectBoard.${project.id}.detailId`, null);

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const hasUnassigned = projectTasks.some((t) => !t.assigneeId);
  const lanes = [
    // Lanes are keyed by member id (people are never matched by name); the empty lane is 'unassigned'.
    ...members.map((m) => ({ key: m.id, label: m.name, member: m })),
    ...(hasUnassigned ? [{ key: UNASSIGNED, label: 'Unassigned', member: null }] : []),
  ];
  const laneTasks = (key) => projectTasks.filter((t) => (key === UNASSIGNED ? !t.assigneeId : t.assigneeId === key));
  const waiting = projectTasks.filter((t) => t.status === 'review');
  const detailTask = tasks.find((t) => t.id === detailId) || null;

  const locked = (t) => t.status === 'done' || t.status === 'review';
  const allSelected = projectTasks.length > 0 && projectTasks.every((t) => selected.has(t.id));

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setMany = (ids, on) => setSelected((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); setConfirmOpen(false); };
  const confirmDelete = () => {
    deleteTasks([...selected]);
    exitSelect();
  };

  const dropOnLane = (e, laneKey) => {
    e.preventDefault();
    setOverLane(null);
    const id = e.dataTransfer.getData('text/team-task-id');
    if (id) reassignTask(id, laneKey === UNASSIGNED ? null : laneKey);
  };
  const dropOnCard = (e, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    setOverCard(null);
    setOverLane(null);
    const id = e.dataTransfer.getData('text/team-task-id');
    if (id && id !== targetId) swapTaskAssignees(id, targetId);
  };

  if (projectTasks.length === 0) {
    return <p className="text-fluid-sm text-ink-500 py-10 text-center">No tasks in this project yet. Use “Create & assign” to add some.</p>;
  }

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-500/10 dark:border-white/10 bg-surface-card dark:bg-surface-darkcard shadow-soft px-3.5 py-2.5">
        {selecting ? (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setMany(projectTasks.map((t) => t.id), !allSelected)}
                className="inline-flex items-center gap-2 text-fluid-sm font-medium text-ink-900 dark:text-white"
              >
                {allSelected ? <CheckSquare size={17} className="text-brand-600" /> : <Square size={17} className="text-ink-500" />}
                {allSelected ? 'Clear all' : `Select all (${projectTasks.length})`}
              </button>
              <span className="text-fluid-xs text-ink-500" aria-live="polite">{selected.size} selected</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={exitSelect}>Cancel</Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={13} />} disabled={selected.size === 0} onClick={() => setConfirmOpen(true)}>
                Delete{selected.size ? ` ${selected.size}` : ''}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-fluid-xs text-ink-500">
              Drag a task to another member to reassign it, or drop it on one of their tasks to swap. Tasks in review or done are locked.
            </p>
            <div className="flex items-center gap-2">
              {waiting.length > 0 && <Badge tone="amber"><Hourglass size={11} /> {waiting.length} to review</Badge>}
              <Button size="sm" variant="secondary" icon={<CheckSquare size={13} />} onClick={() => setSelecting(true)}>Select</Button>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {lanes.map(({ key, label, member }) => {
          const list = laneTasks(key);
          const laneAll = list.length > 0 && list.every((t) => selected.has(t.id));
          return (
            <div
              key={key}
              onDragOver={(e) => { if (selecting) return; e.preventDefault(); setOverLane(key); }}
              onDragLeave={() => setOverLane(null)}
              onDrop={(e) => !selecting && dropOnLane(e, key)}
              className={`rounded-xl p-2.5 border transition-colors min-h-[140px] ${
                overLane === key ? 'bg-brand-500/10 border-brand-500/30' : 'bg-ink-500/[0.04] border-ink-500/[0.06] dark:bg-transparent dark:border-white/5'
              }`}
            >
              <div className="flex items-center gap-2 px-1 mb-3">
                {selecting && list.length > 0 && (
                  <button onClick={() => setMany(list.map((t) => t.id), !laneAll)} aria-label={`${laneAll ? 'Deselect' : 'Select'} all of ${label}'s tasks`} className="shrink-0">
                    {laneAll ? <CheckSquare size={17} className="text-brand-600" /> : <Square size={17} className="text-ink-500" />}
                  </button>
                )}
                {member ? <Avatar id={member.id} name={member.name} size="sm" /> : <span className="w-7 h-7 rounded-full bg-ink-500/20 shrink-0" />}
                <h4 className="font-display font-semibold text-fluid-sm text-ink-900 dark:text-white truncate flex-1">
                  {label}{member?.id === currentUser.id && <span className="text-ink-500 font-normal"> (you)</span>}
                </h4>
                <span className="text-fluid-xs text-ink-500 bg-ink-500/10 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{list.length}</span>
              </div>

              <div className="space-y-2">
                {list.map((t) => {
                  const isLocked = locked(t);
                  const overdue = !isLocked && t.dueDate < todayISO();
                  const isSel = selected.has(t.id);
                  return (
                    <div
                      key={t.id}
                      draggable={!isLocked && !selecting}
                      onDragStart={(e) => e.dataTransfer.setData('text/team-task-id', t.id)}
                      onDragOver={(e) => { if (!isLocked && !selecting) { e.preventDefault(); e.stopPropagation(); setOverCard(t.id); } }}
                      onDragLeave={() => setOverCard(null)}
                      onDrop={(e) => !isLocked && !selecting && dropOnCard(e, t.id)}
                      onClick={() => (selecting ? toggle(t.id) : setDetailId(t.id))}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && (selecting ? toggle(t.id) : setDetailId(t.id))}
                      aria-pressed={selecting ? isSel : undefined}
                      className={`bg-surface-card dark:bg-surface-darkcard border rounded-xl p-3 transition-colors cursor-pointer ${
                        isSel ? 'border-brand-500 ring-2 ring-brand-500/30'
                          : overCard === t.id ? 'border-brand-500 ring-2 ring-brand-500/30'
                          : t.status === 'review' ? 'border-amber-500/40'
                          : 'border-ink-500/10 dark:border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="flex items-center gap-2">
                          {selecting && (isSel ? <CheckSquare size={16} className="text-brand-600" /> : <Square size={16} className="text-ink-500" />)}
                          <Badge tone={STATUS_TONE[t.status]}>{TEAM_STATUS_META[t.status].label}</Badge>
                        </span>
                        <span className={`flex items-center gap-1 text-fluid-xs ${overdue ? 'text-coral-600 font-medium' : 'text-ink-500'}`}>
                          <CalendarDays size={12} /> {fmtDate(t.dueDate)}
                        </span>
                      </div>
                      <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white leading-snug">{t.title}</p>
                      <div className="mt-1.5"><TaskTimer task={t} /></div>

                      {!selecting && t.status === 'review' && (
                        <p className="mt-2 flex items-center gap-1.5 text-fluid-xs font-medium text-amber-600">
                          <ClipboardCheck size={13} /> Review & approve
                          {t.turnIn?.files?.length > 0 && <span className="ml-auto inline-flex items-center gap-1 text-ink-500 font-normal"><Paperclip size={12} /> {t.turnIn.files.length}</span>}
                        </p>
                      )}
                      {!selecting && t.status === 'done' && (
                        <p className="mt-2 flex items-center gap-1.5 text-fluid-xs text-brand-700 dark:text-brand-300">
                          <CheckCircle2 size={13} /> Approved <Lock size={11} className="text-ink-500" />
                        </p>
                      )}
                      {!selecting && !isLocked && (
                        <select
                          value={t.assigneeId || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => reassignTask(t.id, e.target.value || null)}
                          aria-label={`Assign ${t.title} to`}
                          className="mt-2 w-full !h-8 text-fluid-xs bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg pl-2 text-ink-900 dark:text-white focus:outline-none"
                        >
                          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          <option value="">Unassigned</option>
                        </select>
                      )}
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="border border-dashed border-ink-500/20 dark:border-white/15 rounded-xl py-6 text-center text-fluid-xs text-ink-500">
                    Drop a task here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <TeamTaskModal
        open={Boolean(detailTask)}
        task={detailTask}
        onClose={() => setDetailId(null)}
        canReview
        onApprove={(t) => approveTask(t.id)}
        onReturn={(t, reason) => returnTask(t.id, reason)}
      />

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Delete ${selected.size} task${selected.size === 1 ? '' : 's'}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Keep them</Button>
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={confirmDelete}>Delete {selected.size}</Button>
          </>
        }
      >
        <p className="text-fluid-sm text-ink-700 dark:text-ink-300">
          The selected task{selected.size === 1 ? '' : 's'} will be removed from {project.name} for every member, including any files that were turned in. This can’t be undone.
        </p>
      </Modal>
    </div>
  );
}
