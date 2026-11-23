import { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useBusy } from '../../hooks/useBusy';
import { ListTodo, Bell } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import useTaskEditor from '../tasks/useTaskEditor';
import { useTasks } from '../../context/TaskContext';

const emptyReminder = { title: '', time: '', note: '' };

/**
 * Opens from a clicked calendar date and lets the person add one of two
 * things to that day: a full task or a reminder. A type switcher up top
 * decides which form is shown — and BOTH forms appear right away: the task
 * form (Details / Subtasks / Files / Time) is shown inline, there is no
 * extra "Continue" step. Pass `reminder` to edit an existing reminder
 * instead (type switcher hidden, date editable).
 *
 * `allowTasks={false}` (the admin's calendar) leaves reminders as the only thing to add:
 * no Task tab, no task form.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   dateStr: string,
 *   reminder?: object | null,
 *   allowTasks?: boolean,
 * }} props
 */
export default function AddEventModal({ open, onClose, dateStr, reminder: editing = null, allowTasks = true }) {
  const { addReminder, updateReminder } = useTasks();
  const [guard, busy] = useBusy();
  const [type, setType, typeRestored] = usePersistedState('addEvent.type', allowTasks ? 'task' : 'reminder');
  const [reminder, setReminder] = usePersistedState('addEvent.reminder', emptyReminder);
  const [error, setError] = useState('');
  const [date, setDate] = usePersistedState('addEvent.date', dateStr || '');

  const editingId = editing?.id ?? null;
  // After a page refresh the window comes back as it was left: skip the "start fresh" reset for that one opening.
  const openSignature = open ? `${dateStr}|${editingId}` : null;
  const restoredFor = useRef(typeRestored && open ? openSignature : null);
  useEffect(() => {
    if (!open) {
      restoredFor.current = null;
      return;
    }
    if (restoredFor.current === openSignature) return;
    if (editing) {
      setType('reminder');
      setReminder({ title: editing.title, time: editing.time || '', note: editing.note || '' });
      setDate(editing.date || dateStr || '');
    } else {
      setType(allowTasks ? 'task' : 'reminder');
      setReminder(emptyReminder);
      setDate(dateStr || '');
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateStr, editingId]);

  const prettyDate = dateStr
    ? new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const typeTabs = [
    { key: 'task', label: 'Task', icon: ListTodo },
    { key: 'reminder', label: 'Reminder', icon: Bell },
  ];

  // The full task form, due date pre-set to the clicked day. It stays mounted (and keeps
  // what was typed) when the person flips to the Reminder tab and back.
  const taskEditor = useTaskEditor({
    open: open && !editing && allowTasks,
    onClose,
    defaultDueDate: dateStr,
    persistScope: 'addEventTask',
  });

  const handleClose = () => {
    taskEditor.discard();
    onClose();
  };

  const showingTask = allowTasks && type === 'task' && !editing;

  /** Saves the reminder form (the task form saves itself through the task editor's footer). */
  const handleSubmit = (ev) => {
    ev.preventDefault();
    return guard(() => saveReminder());
  };

  const saveReminder = async () => {
    if (!reminder.title.trim()) {
      setError('Give the reminder a title.');
      return;
    }
    let saved;
    if (editing) {
      if (!date) {
        setError('Pick a date for the reminder.');
        return;
      }
      saved = await updateReminder(editing.id, { title: reminder.title.trim(), time: reminder.time, note: reminder.note.trim(), date });
    } else {
      saved = await addReminder({ title: reminder.title.trim(), time: reminder.time, note: reminder.note.trim(), date: dateStr });
    }
    if (saved) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={editing ? 'Edit reminder' : allowTasks ? `Add to ${prettyDate}` : `Add a reminder · ${prettyDate}`}
      size={showingTask ? 'lg' : 'md'}
      footer={
        showingTask ? (
          taskEditor.footer
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add reminder'}</Button>
          </>
        )
      }
    >
      {!editing && allowTasks && (
        <div
          role="tablist"
          aria-label="What to add"
          className="inline-flex items-center bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg p-1 mb-4"
        >
          {typeTabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={type === key}
              onClick={() => { setType(key); setError(''); }}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-fluid-xs font-medium transition-colors ${
                type === key ? 'bg-brand-700 text-white' : 'text-ink-500 hover:bg-ink-500/8 dark:hover:bg-white/5'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}

      {showingTask && taskEditor.body}

      {!showingTask && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="rem-title">
                Title
              </label>
              <input
                id="rem-title"
                type="text"
                value={reminder.title}
                onChange={(e) => setReminder((r) => ({ ...r, title: e.target.value }))}
                placeholder="e.g. Call the vendor about renewal"
                className="w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            {editing && (
              <div>
                <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="rem-date">
                  Date
                </label>
                <input
                  id="rem-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full sm:w-48 rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>
            )}
            <div>
              <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="rem-time">
                Time (optional)
              </label>
              <input
                id="rem-time"
                type="time"
                value={reminder.time}
                onChange={(e) => setReminder((r) => ({ ...r, time: e.target.value }))}
                className="w-full sm:w-48 rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            <div>
              <label className="block text-fluid-xs font-medium text-ink-500 mb-1.5" htmlFor="rem-note">
                Note (optional)
              </label>
              <textarea
                id="rem-note"
                rows={2}
                value={reminder.note}
                onChange={(e) => setReminder((r) => ({ ...r, note: e.target.value }))}
                placeholder="Any extra detail to jog your memory…"
                className="w-full rounded-lg border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-fluid-sm text-ink-900 dark:text-white placeholder:text-ink-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>

          {error && <p className="text-fluid-xs text-coral-500">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
