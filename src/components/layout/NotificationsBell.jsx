import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, AlertTriangle, CalendarClock, AtSign, UserPlus, Inbox, ClipboardCheck, CheckCircle2, CornerUpLeft, Sunrise } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';

const typeMeta = {
  deadline: { icon: CalendarClock, tone: 'text-amber-600 bg-amber-500/10' },
  overdue: { icon: AlertTriangle, tone: 'text-coral-600 bg-coral-500/10' },
  mention: { icon: AtSign, tone: 'text-brand-600 bg-brand-500/10' },
  assignment: { icon: UserPlus, tone: 'text-sage-600 bg-sage-500/10' },
  'turn-in': { icon: ClipboardCheck, tone: 'text-amber-600 bg-amber-500/10' },
  approved: { icon: CheckCircle2, tone: 'text-brand-600 bg-brand-500/10' },
  return: { icon: CornerUpLeft, tone: 'text-coral-600 bg-coral-500/10' },
  digest: { icon: Sunrise, tone: 'text-brand-600 bg-brand-500/10' },
};

/** Formats an ISO datetime as a short relative-ish label. */
function formatWhen(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
}

/**
 * Bell icon + dropdown showing task-assignment, deadline, overdue, and
 * mention notifications — the PPT's Notifications module. Clicking a
 * notification marks it read and jumps to the Task Workspace.
 */
export default function NotificationsBell() {
  const { notifications, unreadNotificationCount, markNotificationRead, markAllNotificationsRead, allTasks } = useTasks();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleSelect = (n) => {
    markNotificationRead(n.id);
    setOpen(false);
    if (n.link) {
      navigate(n.link);
      return;
    }
    if (n.taskId) {
      const task = allTasks.find((t) => t.id === n.taskId);
      if (task?.groupId) navigate(`/team?team=${task.groupId}`);
      else navigate(task?.projectId ? `/tasks?project=${task.projectId}` : '/tasks');
    }
  };

  const sorted = notifications.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
        className="relative p-2.5 rounded-full text-ink-500 dark:text-ink-300 hover:bg-ink-500/8 dark:hover:bg-white/8 hover:text-ink-900 dark:hover:text-white transition-colors"
      >
        <Bell size={19} />
        {unreadNotificationCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-coral-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-80 max-w-[85vw] bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl shadow-elevated overflow-hidden z-40"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-500/10 dark:border-white/10">
            <h3 className="font-display font-semibold text-fluid-sm text-ink-900 dark:text-white">Notifications</h3>
            {unreadNotificationCount > 0 && (
              <button
                onClick={markAllNotificationsRead}
                className="flex items-center gap-1 text-fluid-xs text-brand-600 hover:underline"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8 text-ink-500">
                <Inbox size={22} className="mb-2 opacity-60" />
                <p className="text-fluid-sm">You're all caught up.</p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-500/8 dark:divide-white/8">
                {sorted.map((n) => {
                  const meta = typeMeta[n.type] || typeMeta.deadline;
                  const Icon = meta.icon;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => handleSelect(n)}
                        className={`w-full text-left flex items-start gap-2.5 px-4 py-3 hover:bg-ink-500/5 dark:hover:bg-white/5 transition-colors ${
                          !n.read ? 'bg-brand-500/[0.04]' : ''
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.tone}`}>
                          <Icon size={13} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-fluid-xs leading-snug ${!n.read ? 'font-medium text-ink-900 dark:text-white' : 'text-ink-700 dark:text-ink-300'}`}>
                            {n.message}
                          </p>
                          <p className="text-fluid-xs text-ink-500 mt-0.5">{formatWhen(n.createdAt)}</p>
                        </div>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
