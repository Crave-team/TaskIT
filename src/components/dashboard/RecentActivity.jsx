import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';
import { useAuth } from '../../context/AuthContext';

function formatWhen(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

/**
 * Small feed of the most recent audit-log entries, so the dashboard gives
 * a sense of what's been happening without opening the full Admin log.
 */
export default function RecentActivity() {
  const { activityLog } = useTasks();
  const { currentUser } = useAuth();
  // My Workspace only — what happens inside a team belongs to that team.
  const recent = activityLog.filter((l) => !l.groupId).slice(0, 6);

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-5 shadow-soft">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 font-display font-semibold text-fluid-base text-ink-900 dark:text-white">
          <History size={16} className="text-brand-600" /> Recent activity
        </h3>
        {currentUser?.accountRole === 'admin' && <Link to="/activity" className="text-fluid-xs text-brand-600 hover:underline">View log</Link>}
      </div>
      {recent.length === 0 ? (
        <p className="text-fluid-sm text-ink-500">Nothing has happened yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {recent.map((log) => (
            <li key={log.id} className="flex items-center justify-between gap-2 text-fluid-xs">
              <p className="text-ink-700 dark:text-ink-300 min-w-0 truncate">
                <span className="font-medium text-ink-900 dark:text-white">{log.actor}</span> {log.action}{' '}
                <span className="font-medium text-ink-900 dark:text-white">{log.target}</span>
              </p>
              <span className="text-ink-500 shrink-0">{formatWhen(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
