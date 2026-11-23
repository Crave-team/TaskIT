import { Link } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import ProgressBar from '../common/ProgressBar';
import { useTasks } from '../../context/TaskContext';

const toneFor = { brand: 'brand', coral: 'coral', sage: 'sage', amber: 'amber' };

/**
 * Compact list of active projects with their live completion percentage —
 * a quick pulse-check without leaving the dashboard.
 */
export default function ProjectsOverview() {
  const { projects, projectProgress } = useTasks();
  const active = projects.filter((p) => p.status !== 'completed').slice(0, 4);

  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-xl p-5 shadow-soft">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 font-display font-semibold text-fluid-base text-ink-900 dark:text-white">
          <FolderKanban size={16} className="text-brand-600" /> Project progress
        </h3>
        <Link to="/tasks" className="text-fluid-xs text-brand-600 hover:underline">View all</Link>
      </div>
      {active.length === 0 ? (
        <p className="text-fluid-sm text-ink-500">No active projects yet.</p>
      ) : (
        <ul className="space-y-3.5">
          {active.map((p) => (
            <li key={p.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-fluid-sm font-medium text-ink-900 dark:text-white truncate">{p.name}</span>
                <span className="text-fluid-xs text-ink-500 shrink-0">{projectProgress(p.id)}%</span>
              </div>
              <ProgressBar value={projectProgress(p.id)} tone={toneFor[p.color] || 'brand'} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
