import { usePersistedState } from '../../hooks/usePersistedState';
import { CalendarDays, Send, Undo2, CheckCircle2, CornerUpLeft, Hourglass, AlertTriangle, Pencil } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { FileList } from '../common/FileViewer';
import { TaskTimer, formatDuration } from './shared';
import { PRIORITY_META, TEAM_STATUS_META } from '../../data/mockData';

const fmtFull = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const STATUS_TONE = { todo: 'neutral', 'in-progress': 'brand', review: 'amber', done: 'sage' };

/**
 * One dialog for a team task, whoever opens it.
 *  - Assignee: sees the details, any feedback from a returned task, and can Turn in
 *    (To Do / In Progress) or Undo turn-in (To Review). When a turn-in was undone or returned, the
 *    earlier note and files are kept and "Edit turn-in" reopens them for changes.
 *  - Group admin: sees what was turned in (files can be viewed and downloaded) and can
 *    Approve (-> Done) or Return with a reason (-> In Progress) while it is in To Review.
 */
export default function TeamTaskModal({ open, task, onClose, onTurnIn, onUndo, onApprove, onReturn, canReview = false }) {
  const [returning, setReturning] = usePersistedState('teamTaskModal.returning', false);
  const [reason, setReason] = usePersistedState('teamTaskModal.reason', '');
  if (!task) return null;

  const done = task.status === 'done';
  const inReview = task.status === 'review';
  const canTurnIn = Boolean(onTurnIn) && !done && !inReview;
  const canUndo = Boolean(onUndo) && inReview;
  const draft = !done && !inReview ? task.turnInDraft : null;
  const reviewing = canReview && inReview;

  const close = () => { setReturning(false); setReason(''); onClose(); };

  const footer = reviewing ? (
    returning ? (
      <>
        <Button variant="ghost" onClick={() => setReturning(false)}>Back</Button>
        <Button variant="danger" icon={<CornerUpLeft size={14} />} onClick={() => { onReturn(task, reason); close(); }}>Return task</Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={close}>Close</Button>
        <Button variant="secondary" icon={<CornerUpLeft size={14} />} onClick={() => setReturning(true)}>Return…</Button>
        <Button icon={<CheckCircle2 size={14} />} onClick={() => { onApprove(task); close(); }}>Approve</Button>
      </>
    )
  ) : (
    <>
      <Button variant="secondary" onClick={close}>Close</Button>
      {canUndo && <Button variant="secondary" icon={<Undo2 size={14} />} onClick={() => { onUndo(task); close(); }}>Undo turn-in</Button>}
      {canTurnIn && draft && <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => onTurnIn(task)}>Edit turn-in</Button>}
      {canTurnIn && <Button icon={<Send size={14} />} onClick={() => onTurnIn(task)}>Turn in</Button>}
    </>
  );

  return (
    <Modal open={open} onClose={close} title={task.title} size="lg" footer={footer}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={PRIORITY_META[task.priority].color}>{PRIORITY_META[task.priority].label}</Badge>
          <Badge tone={STATUS_TONE[task.status]}>{TEAM_STATUS_META[task.status].label}</Badge>
          <span className="inline-flex items-center gap-1 text-fluid-xs text-ink-500">
            <CalendarDays size={13} /> Due {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <TaskTimer task={task} />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-fluid-xs text-ink-500 mb-1">Assigned to</p>
            <p className="text-fluid-sm font-medium text-ink-900 dark:text-white">{task.assignee}</p>
          </div>
          <div>
            <p className="text-fluid-xs text-ink-500 mb-1">Description</p>
            <p className="text-fluid-sm text-ink-900 dark:text-white whitespace-pre-wrap">{task.description || 'No description.'}</p>
          </div>
        </div>

        {task.returned && !done && (
          <div className="rounded-xl border border-coral-500/30 bg-coral-500/8 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-fluid-sm font-semibold text-coral-600">
              <AlertTriangle size={14} /> Returned by {task.returned.by} <span className="font-normal text-ink-500">· {fmtFull(task.returned.at)}</span>
            </p>
            <p className="mt-1 text-fluid-sm text-ink-900 dark:text-white whitespace-pre-wrap">{task.returned.note || 'It did not meet the requirements. Please revise and turn it in again.'}</p>
          </div>
        )}

        {inReview && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-fluid-xs text-ink-700 dark:text-ink-300">
            <Hourglass size={14} className="text-amber-600 mt-0.5 shrink-0" />
            {canReview ? 'Waiting for your review. Approve it to mark it Done, or return it with a reason.' : 'Waiting for a group admin to review. You can undo the turn-in until it is approved.'}
          </p>
        )}

        {draft && (
          <div className="rounded-xl bg-ink-500/5 dark:bg-white/5 p-3.5 space-y-2.5">
            <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
              {canTurnIn ? 'Your earlier turn-in' : `${draft.by}’s earlier turn-in`} <span className="text-ink-500 font-normal">· {canTurnIn ? 'kept so you can edit it' : 'being revised'}</span>
            </p>
            {draft.note && <p className="text-fluid-sm text-ink-700 dark:text-ink-300 whitespace-pre-wrap">“{draft.note}”</p>}
            <FileList files={draft.files} emptyText="No files were attached." />
          </div>
        )}

        {task.turnIn && (
          <div className="rounded-xl bg-brand-500/8 p-3.5 space-y-2.5">
            <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
              Turned in by {task.turnIn.by} <span className="text-ink-500 font-normal">· {fmtFull(task.turnIn.at)}</span>
            </p>
            {task.turnIn.durationMs != null && (
              <p className="text-fluid-xs text-ink-500">Time taken: <strong className="font-semibold text-ink-900 dark:text-white">{formatDuration(task.turnIn.durationMs)}</strong> from assignment to turn-in</p>
            )}
            {task.turnIn.note && <p className="text-fluid-sm text-ink-700 dark:text-ink-300 whitespace-pre-wrap">“{task.turnIn.note}”</p>}
            <FileList files={task.turnIn.files} emptyText="No files were attached." />
            {done && task.turnIn.approvedBy && (
              <p className="flex items-center gap-1.5 text-fluid-xs font-medium text-brand-700 dark:text-brand-300">
                <CheckCircle2 size={13} /> Approved by {task.turnIn.approvedBy} · {fmtFull(task.turnIn.approvedAt)}
              </p>
            )}
          </div>
        )}

        {reviewing && returning && (
          <div>
            <label htmlFor="return-reason" className="block text-fluid-xs font-medium text-ink-500 mb-1.5">What needs to change? <span className="font-normal">(shown to {task.assignee})</span></label>
            <textarea
              id="return-reason"
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. The file is missing the summary page — please add it and turn it in again."
              className="w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none resize-none"
            />
            <p className="mt-1 text-fluid-xs text-ink-500">The task goes back to <strong>In Progress</strong> on {task.assignee}'s board.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
