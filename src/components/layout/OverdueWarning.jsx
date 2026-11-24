import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight, Users } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { useTasks } from '../../context/TaskContext';
import { useTour } from '../../context/TourContext';


const daysLate = (dueDate) => {
  const due = new Date(`${dueDate}T00:00:00`);
  const now = new Date(new Date().toDateString());
  return Math.max(1, Math.round((now - due) / (24 * 60 * 60 * 1000)));
};

/**
 * Pops up on screen as a warning whenever one of your tasks is past its due date and not
 * finished. It lists the late tasks (most overdue first) and jumps straight to them.
 * Each task is only warned about once until it stops being overdue; it is also added to
 * the notification bell so it can be found again after the pop-up is dismissed.
 * Stays out of the way while the product tour is running.
 */
export default function OverdueWarning() {
  const { unacknowledgedOverdue, acknowledgePopups, deadlineAlertsOn } = useTasks();
  const { open: tourOpen } = useTour();
  const navigate = useNavigate();

  // The service creates each overdue notice (and its bell entry) exactly once; the items here are the
  // ones the person has not dismissed yet.
  const list = unacknowledgedOverdue.slice().sort((a, b) => a.date.localeCompare(b.date));
  if (tourOpen || !deadlineAlertsOn || list.length === 0) return null;

  const dismiss = () => acknowledgePopups(list.map((t) => t.key));
  const go = (t) => {
    dismiss();
    navigate(t.groupId ? `/team?team=${t.groupId}` : `/tasks?project=${t.projectId}&task=${t.itemId}`);
  };

  return (
    <Modal
      open
      onClose={dismiss}
      title="Overdue task warning"
      footer={<Button onClick={dismiss}>Got it</Button>}
    >
      <div role="alertdialog" aria-label="Overdue tasks" className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-coral-500/30 bg-coral-500/10 px-4 py-3">
          <span className="w-9 h-9 rounded-full bg-coral-500 text-white flex items-center justify-center shrink-0 animate-pulse">
            <AlertTriangle size={17} />
          </span>
          <div>
            <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
              {list.length === 1 ? '1 task is past its due date' : `${list.length} tasks are past their due date`}
            </p>
            <p className="text-fluid-xs text-ink-700 dark:text-ink-300 mt-0.5">Finish them, or move the due date if the plan has changed.</p>
          </div>
        </div>

        <ul className="space-y-2">
          {list.slice(0, 6).map((t) => (
            <li key={t.key}>
              <button
                onClick={() => go(t)}
                className="w-full text-left flex items-center gap-3 rounded-xl border border-ink-500/10 dark:border-white/10 bg-surface-card dark:bg-white/5 px-3.5 py-2.5 hover:border-coral-500/40 transition-colors"
              >
                <CalendarClock size={16} className="text-coral-600 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fluid-sm font-medium text-ink-900 dark:text-white">{t.title}</span>
                  <span className="flex items-center gap-1.5 text-fluid-xs text-coral-600">
                    {daysLate(t.date)} day{daysLate(t.date) === 1 ? '' : 's'} overdue
                    {t.groupId && <span className="inline-flex items-center gap-1 text-ink-500"><Users size={11} /> team task</span>}
                  </span>
                </span>
                <ChevronRight size={15} className="text-ink-500 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
        {list.length > 6 && <p className="text-fluid-xs text-ink-500">…and {list.length - 6} more. Open the notification bell to see them all.</p>}
      </div>
    </Modal>
  );
}
