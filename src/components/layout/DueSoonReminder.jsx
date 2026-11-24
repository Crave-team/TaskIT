import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, Bell, CalendarClock, ChevronRight, Clock3, Users } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { useTasks } from '../../context/TaskContext';
import { useTour } from '../../context/TourContext';
import { PRIORITY_META } from '../../data/mockData';
import { useOpenModalCount } from '../common/modalStore';

const prettyDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/**
 * Pops up when a task or calendar reminder is due TODAY or TOMORROW (the day before), so nothing
 * sneaks up on you.
 *  - Members are reminded about their own open tasks (personal and team) and their reminders.
 *  - Admins are reminded about their calendar reminders only.
 * Each item is announced once; it is also added to the notification bell so it can be found
 * again after the pop-up is dismissed. Turn it off in Settings → Notifications ("Due-date
 * reminders"). It waits for the overdue warning and the product tour to finish first.
 */
export default function DueSoonReminder() {
  const { unacknowledgedDueSoon, acknowledgePopups, unacknowledgedOverdue, deadlineAlertsOn } = useTasks();
  const { open: tourOpen } = useTour();
  const navigate = useNavigate();

  // Wait for any dialog the person is using (e.g. the calendar sheet they just added a reminder
  // in) to close before popping up. Once shown it stays until dismissed.
  const openModals = useOpenModalCount();
  const hasItems = unacknowledgedDueSoon.length > 0;
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!hasItems) setArmed(false);
    else if (openModals === 0 && !tourOpen) setArmed(true);
  }, [hasItems, openModals, tourOpen]);

  // The service creates each notice (and its bell entry) exactly once; these are the undismissed ones.
  const overdueShowing = deadlineAlertsOn && unacknowledgedOverdue.length > 0;
  if (!deadlineAlertsOn || !armed || tourOpen || overdueShowing || !hasItems) return null;

  // Due today first, then tomorrow; tasks before reminders; reminders by time of day.
  const whenOf = (i) => (i.when === 'today' ? 0 : 1);
  const list = unacknowledgedDueSoon.slice().sort((a, b) => {
    if (whenOf(a) !== whenOf(b)) return whenOf(a) - whenOf(b);
    if (a.kind !== b.kind) return a.kind === 'task' ? -1 : 1;
    return (a.time || '').localeCompare(b.time || '');
  });
  const tasks = list.filter((i) => i.kind === 'task').length;
  const reminders = list.length - tasks;
  const todayCount = list.filter((i) => i.when === 'today').length;
  const allToday = todayCount === list.length;
  const allTomorrow = todayCount === 0;
  const whenText = allToday ? 'due today' : allTomorrow ? 'due tomorrow' : 'due today or tomorrow';
  const date = allToday || allTomorrow ? prettyDate(list[0].date) : 'Today and tomorrow';

  const dismiss = () => acknowledgePopups(list.map((i) => i.key));
  const go = (item) => {
    dismiss();
    if (item.kind === 'reminder') navigate('/calendar');
    else navigate(item.groupId ? `/team?team=${item.groupId}` : `/tasks?project=${item.projectId}&task=${item.itemId}`);
  };

  const heading = [
    tasks ? `${tasks} task${tasks === 1 ? '' : 's'}` : '',
    reminders ? `${reminders} reminder${reminders === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' and ');

  return (
    <Modal open onClose={dismiss} title={allToday ? 'Due today' : allTomorrow ? 'Coming up tomorrow' : 'Coming up'} footer={<Button onClick={dismiss}>Got it</Button>}>
      <div role="alertdialog" aria-label="Due date reminder" className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span className="w-9 h-9 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 animate-pulse">
            <BellRing size={17} />
          </span>
          <div>
            <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">
              {heading} {whenText}
            </p>
            <p className="text-fluid-xs text-ink-700 dark:text-ink-300 mt-0.5">{date} — {allToday ? "don't let it slip today." : 'a friendly heads-up so you can get ready.'}</p>
          </div>
        </div>

        <ul className="space-y-2">
          {list.slice(0, 6).map((item) => (
            <li key={item.key}>
              <button
                onClick={() => go(item)}
                className="w-full text-left flex items-center gap-3 rounded-xl border border-ink-500/10 dark:border-white/10 bg-surface-card dark:bg-white/5 px-3.5 py-2.5 hover:border-amber-500/40 transition-colors"
              >
                {item.kind === 'task'
                  ? <CalendarClock size={16} className="text-amber-600 shrink-0" />
                  : <Bell size={16} className="text-amber-600 shrink-0" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fluid-sm font-medium text-ink-900 dark:text-white">{item.title}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-fluid-xs text-ink-500">
                    {item.kind === 'task' ? (
                      <>
                        <Badge tone={PRIORITY_META[item.priority]?.color}>{PRIORITY_META[item.priority]?.label}</Badge>
                        {item.when === 'today' ? 'Task due today' : 'Task due tomorrow'}
                        {item.groupId && <span className="inline-flex items-center gap-1"><Users size={11} /> team task</span>}
                      </>
                    ) : (
                      <>
                        {item.when === 'today' ? 'Reminder today' : 'Reminder tomorrow'}
                        {item.time
                          ? <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {item.time}</span>
                          : <span>· all day</span>}
                      </>
                    )}
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
