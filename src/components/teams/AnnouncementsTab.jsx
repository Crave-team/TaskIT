import { usePersistedState } from '../../hooks/usePersistedState';
import { useBusy } from '../../hooks/useBusy';
import { Megaphone, Trash2 } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { Avatar, timeAgo, panelClass } from './shared';
import { useGroups } from '../../context/GroupContext';
import { useAuth } from '../../context/AuthContext';

/**
 * Team announcements: group admins post and delete; every member reads.
 * Oldest first, newest at the bottom, with the composer below the list.
 */
export default function AnnouncementsTab({ group, isAdmin }) {
  const { teamAnnouncements, postTeamAnnouncement, deleteTeamAnnouncement } = useGroups();
  const { accounts } = useAuth();
  const [draft, setDraft] = usePersistedState(`team.${group.id}.announce.draft`, '');
  const [guard, busy] = useBusy();
  const list = teamAnnouncements.filter((a) => a.groupId === group.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nameOf = (id) => accounts.find((a) => a.id === id)?.name || 'Former member';

  const post = () => guard(async () => {
    if (!draft.trim()) return;
    if (await postTeamAnnouncement(group.id, draft)) setDraft('');
  });

  return (
    <div className="space-y-4">
      {list.length === 0 ? (
        <p className="text-fluid-sm text-ink-500 text-center py-10">No announcements yet.</p>
      ) : (
        list.map((a) => (
          <article key={a.id} className={`${panelClass} p-4`}>
            <div className="flex items-start gap-3">
              <Avatar id={a.authorId} name={nameOf(a.authorId)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-fluid-sm font-semibold text-ink-900 dark:text-white">{nameOf(a.authorId)}</p>
                  <Badge tone="brand">Admin</Badge>
                  <span className="text-fluid-xs text-ink-500">{timeAgo(a.createdAt)}</span>
                </div>
                <p className="mt-1 text-fluid-sm text-ink-900 dark:text-white whitespace-pre-wrap break-words">{a.text}</p>
              </div>
              {isAdmin && (
                <button onClick={() => deleteTeamAnnouncement(a.id)} aria-label="Delete announcement" className="p-1.5 rounded-lg text-ink-500 hover:text-coral-600 hover:bg-coral-500/10 transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </article>
        ))
      )}

      {isAdmin && (
        <div className={`${panelClass} p-3.5 space-y-2`}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Share an announcement with the whole team…"
            aria-label="New announcement"
            className="w-full text-fluid-sm bg-white dark:bg-surface-dark border border-ink-500/15 dark:border-white/10 rounded-lg px-3 py-2 text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" icon={<Megaphone size={13} />} onClick={post} disabled={!draft.trim() || busy}>Announce</Button>
          </div>
        </div>
      )}
    </div>
  );
}
