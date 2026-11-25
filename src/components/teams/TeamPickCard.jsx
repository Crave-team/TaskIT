import { useState } from 'react';
import { Globe2, Lock, Users, FolderKanban, ArrowRight } from 'lucide-react';
import Badge from '../common/Badge';
import { TeamIcon, panelClass } from './shared';
import VisibilityToggle from './VisibilityToggle';

/**
 * One team on the landing screen. The card body is a button: click it to
 * open that team. Shows your role in it, how many people and projects it has,
 * and lets the owner switch the team between Public and Private right here.
 */
export default function TeamPickCard({ group, role, memberCount, projectCount, pendingCount = 0, canEditVisibility = false, onChangeVisibility, onOpen }) {
  const [saving, setSaving] = useState(false);
  const change = async (next) => {
    setSaving(true);
    try {
      await onChangeVisibility?.(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${panelClass} group w-full flex flex-col hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-150`}>
      <button onClick={onOpen} aria-label={`Open ${group.name}`} className="text-left w-full p-5 pb-3 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <TeamIcon id={group.id} name={group.name} />
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white truncate">{group.name}</p>
            <p className="text-fluid-xs text-ink-500 line-clamp-2 mt-0.5">{group.description || 'No description yet.'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-fluid-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5"><Users size={13} /> {memberCount} member{memberCount === 1 ? '' : 's'}</span>
          <span className="inline-flex items-center gap-1.5"><FolderKanban size={13} /> {projectCount} project{projectCount === 1 ? '' : 's'}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-brand-700 dark:text-brand-300">
            Open team <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-auto mx-5 py-3 border-t border-ink-500/10 dark:border-white/10">
        <span className="flex items-center gap-2">
          <Badge tone={role === 'Owner' ? 'amber' : role === 'Group admin' ? 'brand' : 'neutral'}>{role}</Badge>
          {pendingCount > 0 && <Badge tone="coral">{pendingCount} join request{pendingCount === 1 ? '' : 's'}</Badge>}
        </span>
        {canEditVisibility ? (
          <VisibilityToggle size="sm" value={group.visibility} onChange={change} disabled={saving} />
        ) : (
          <span className="inline-flex items-center gap-1.5 text-fluid-xs text-ink-500">
            {group.visibility === 'public' ? <Globe2 size={13} /> : <Lock size={13} />}
            {group.visibility === 'public' ? 'Public' : 'Private'}
          </span>
        )}
      </div>
    </div>
  );
}
