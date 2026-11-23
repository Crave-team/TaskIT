import { Globe2, Lock, Users } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';

/**
 * Summary card for one group, used in both the "My groups" grid and the
 * public browse grid.
 *
 * @param {{
 *   group: object,
 *   memberCount: number,
 *   isOwner: boolean,
 *   isMember: boolean,
 *   pending?: boolean,
 *   onOpen: () => void,
 *   onJoin?: () => void,
 * }} props
 */
export default function GroupCard({ group, memberCount, isOwner, isMember, pending = false, onOpen, onJoin }) {
  return (
    <div className="bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 rounded-2xl p-4 shadow-soft hover:shadow-elevated transition-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display font-semibold text-fluid-base text-ink-900 dark:text-white truncate">{group.name}</p>
          <p className="text-fluid-xs text-ink-500 line-clamp-2 mt-0.5">{group.description || 'No description yet.'}</p>
        </div>
        <Badge tone={group.visibility === 'public' ? 'brand' : 'neutral'}>
          {group.visibility === 'public' ? <Globe2 size={11} /> : <Lock size={11} />}
          {group.visibility === 'public' ? 'Public' : 'Private'}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 text-fluid-xs text-ink-500">
        <Users size={13} />
        {memberCount} member{memberCount === 1 ? '' : 's'}
        {isOwner && <Badge tone="amber" size="sm">Owner</Badge>}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        {isMember ? (
          <Button size="sm" variant="secondary" className="flex-1" onClick={onOpen}>
            Open
          </Button>
        ) : pending ? (
          <Button size="sm" variant="secondary" className="flex-1" disabled>
            Request pending
          </Button>
        ) : (
          <Button size="sm" className="flex-1" onClick={onJoin}>
            Request to join
          </Button>
        )}
      </div>
    </div>
  );
}
