import { useState } from 'react';
import { CalendarDays, Lock, Send, CheckCircle2, Paperclip, Undo2, Hourglass, CornerUpLeft, Pencil } from 'lucide-react';
import Badge from '../common/Badge';
import { PRIORITY_META, TEAM_STATUS_META, todayISO } from '../../data/mockData';
import { useTasks } from '../../context/TaskContext';
import { timeAgo, TaskTimer } from './shared';

const COLUMNS = ['todo', 'in-progress', 'review', 'done'];
const MOVABLE = ['todo', 'in-progress'];

const COLUMN_STYLE = {
  todo: { bar: 'bg-ink-500/50', hint: null },
  'in-progress': { bar: 'bg-brand-500', hint: null },
  review: { bar: 'bg-amber-500', hint: 'Turned-in tasks wait here for a group admin.' },
  done: { bar: 'bg-sage-500', hint: 'Approved by a group admin.' },
};

const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * A member's own tasks for one team project.
 *   To Do ⇄ In Progress  — drag cards or use the "Move to" menu.
 *   To Review            — filled automatically by Turn in; the turn-in can be undone.
 *   Done                 — only after a group admin approves. A returned task drops back to In Progress.
 * A task whose turn-in was undone or returned keeps its earlier note and files; its card offers
 * "Edit turn-in" so the member can revise them and turn in again.
 */
export default function TeamKanban({ tasks, onOpen, onTurnIn, onUndo }) {
  const { moveTeamTask } = useTasks();
  const [overCol, setOverCol] = useState(null);

  const drop = (e, status) => {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData('text/team-task-id');
    if (id) moveTeamTask(id, status);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((status) => {
        const locked = !MOVABLE.includes(status);
        const colTasks = tasks.filter((t) => t.status === status);
        const style = COLUMN_STYLE[status];
        return (
          <div
            key={status}
            onDragOver={(e) => { if (locked) return; e.preventDefault(); setOverCol(status); }}
            onDragLeave={() => setOverCol(null)}
            onDrop={(e) => !locked && drop(e, status)}
            className={`rounded-xl p-2.5 border transition-colors min-h-[180px] ${
              overCol === status ? 'bg-brand-500/10 border-brand-500/30' : 'bg-ink-500/[0.04] border-ink-500/[0.06] dark:bg-transparent dark:border-white/5'
            }`}
          >
            <div className={`h-1 rounded-full ${style.bar} mb-2.5`} aria-hidden="true" />
            <div className="flex items-center justify-between px-1 mb-3">
              <h3 className="flex items-center gap-1.5 font-display font-semibold text-fluid-sm text-ink-900 dark:text-white">
                {TEAM_STATUS_META[status].label}
                {locked && <Lock size={12} className="text-ink-500" aria-label="Moves automatically" />}
              </h3>
              <span className="text-fluid-xs text-ink-500 bg-ink-500/10 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">{colTasks.length}</span>
            </div>
            {style.hint && <p className="px-1 -mt-1 mb-3 text-fluid-xs text-ink-500">{style.hint}</p>}

            <div className="space-y-2.5">
              {colTasks.map((t) => {
                const overdue = t.status !== 'done' && t.status !== 'review' && t.dueDate < todayISO();
                const draggable = MOVABLE.includes(t.status);
                return (
                  <div
                    key={t.id}
                    draggable={draggable}
                    onDragStart={(e) => e.dataTransfer.setData('text/team-task-id', t.id)}
                    onClick={() => onOpen(t)}
                    onKeyDown={(e) => e.key === 'Enter' && onOpen(t)}
                    role="button"
                    tabIndex={0}
                    className={`bg-surface-card dark:bg-surface-darkcard border rounded-xl p-3.5 hover:shadow-elevated transition-shadow ${draggable ? 'cursor-grab' : 'cursor-pointer'} ${
                      t.returned && t.status === 'in-progress' ? 'border-coral-500/40' : 'border-ink-500/10 dark:border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge tone={PRIORITY_META[t.priority].color}>{PRIORITY_META[t.priority].label}</Badge>
                      <span className={`flex items-center gap-1 text-fluid-xs ${overdue ? 'text-coral-600 font-medium' : 'text-ink-500'}`}>
                        <CalendarDays size={13} /> {fmtDate(t.dueDate)}{overdue && ' · overdue'}
                      </span>
                    </div>
                    <h4 className="text-fluid-sm font-semibold text-ink-900 dark:text-white leading-snug">{t.title}</h4>
                    {t.description && <p className="mt-1 text-fluid-xs text-ink-500 line-clamp-2">{t.description}</p>}
                    <div className="mt-2"><TaskTimer task={t} /></div>

                    {t.returned && t.status === 'in-progress' && (
                      <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-coral-500/10 px-2.5 py-1.5 text-fluid-xs text-coral-600">
                        <CornerUpLeft size={12} className="mt-0.5 shrink-0" />
                        <span className="min-w-0"><strong className="font-semibold">Returned</strong>{t.returned.note ? `: ${t.returned.note}` : ' — revise and turn in again.'}</span>
                      </p>
                    )}

                    {t.turnInDraft && t.status === 'in-progress' && (
                      <p className="mt-2.5 flex items-center gap-1.5 text-fluid-xs text-ink-500">
                        <Paperclip size={12} className="shrink-0" />
                        {t.turnInDraft.files?.length
                          ? `${t.turnInDraft.files.length} file${t.turnInDraft.files.length === 1 ? '' : 's'} kept from your earlier turn-in`
                          : 'Your earlier turn-in note is kept'}
                      </p>
                    )}

                    {t.status === 'review' && (
                      <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <p className="flex items-center gap-1.5 text-fluid-xs text-amber-600">
                          <Hourglass size={13} /> Turned in {t.turnIn ? timeAgo(t.turnIn.at) : ''} · awaiting approval
                          {t.turnIn?.files?.length > 0 && (
                            <span className="ml-auto inline-flex items-center gap-1 text-ink-500"><Paperclip size={12} /> {t.turnIn.files.length}</span>
                          )}
                        </p>
                        <button
                          onClick={() => onUndo(t)}
                          className="w-full inline-flex items-center justify-center gap-1.5 text-fluid-xs font-medium rounded-lg border border-ink-500/20 dark:border-white/15 h-8 text-ink-700 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/5 transition-colors"
                        >
                          <Undo2 size={12} /> Undo turn-in
                        </button>
                      </div>
                    )}

                    {t.status === 'done' && (
                      <p className="mt-3 flex items-center gap-1.5 text-fluid-xs text-brand-700 dark:text-brand-300">
                        <CheckCircle2 size={13} /> Approved {t.turnIn?.approvedAt ? timeAgo(t.turnIn.approvedAt) : ''}
                        {t.turnIn?.files?.length > 0 && (
                          <span className="ml-auto inline-flex items-center gap-1 text-ink-500"><Paperclip size={12} /> {t.turnIn.files.length}</span>
                        )}
                      </p>
                    )}

                    {draggable && (
                      <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.status}
                          onChange={(e) => moveTeamTask(t.id, e.target.value)}
                          aria-label={`Move ${t.title}`}
                          className="flex-1 min-w-0 !h-8 text-fluid-xs bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg pl-2 text-ink-900 dark:text-white focus:outline-none"
                        >
                          {MOVABLE.map((s) => <option key={s} value={s}>{TEAM_STATUS_META[s].label}</option>)}
                        </select>
                        {t.turnInDraft && (
                          <button
                            onClick={() => onTurnIn(t)}
                            aria-label={`Edit turn-in of ${t.title}`}
                            className="inline-flex items-center gap-1.5 text-fluid-xs font-medium rounded-lg border border-ink-500/20 dark:border-white/15 px-2.5 h-8 text-ink-700 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/5 transition-colors whitespace-nowrap"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                        <button
                          onClick={() => onTurnIn(t)}
                          className="inline-flex items-center gap-1.5 text-fluid-xs font-medium bg-brand-700 text-white rounded-lg px-2.5 h-8 hover:bg-[#0B6F51] transition-colors whitespace-nowrap"
                        >
                          <Send size={12} /> Turn in
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {colTasks.length === 0 && (
                <div className="border border-dashed border-ink-500/20 dark:border-white/15 rounded-xl py-6 text-center text-fluid-xs text-ink-500">
                  {status === 'review' ? 'Nothing waiting for review' : status === 'done' ? 'Nothing approved yet' : 'Drop a task here'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
