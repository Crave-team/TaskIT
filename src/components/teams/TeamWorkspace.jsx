import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessagesSquare, FolderKanban, Megaphone, ClipboardList, Users, Globe2, Lock, BarChart3 } from 'lucide-react';
import Tabs from '../common/Tabs';
import Badge from '../common/Badge';
import ChatTab from './ChatTab';
import TeamProjectsTab from './TeamProjectsTab';
import AnnouncementsTab from './AnnouncementsTab';
import AssignTaskTab from './AssignTaskTab';
import MembersTab from './MembersTab';
import TeamReportsTab from './TeamReportsTab';
import { TeamIcon, panelClass } from './shared';
import { useGroups, isAdminOf } from '../../context/GroupContext';
import { useAuth } from '../../context/AuthContext';
import { useTasks } from '../../context/TaskContext';

/**
 * Full-width workspace for the team you opened. What you see depends on your role:
 *   Member      → Chat · Projects · Announcements · Reports · Members
 *   Group Admin → Chat · Projects · Announcements · Assign task · Reports · Members
 * Reports are per team: the diagrams and statuses cover only this team's tasks.
 */
export default function TeamWorkspace({ group, onBackToList, onGone }) {
  const { messages, teamAnnouncements, joinRequests } = useGroups();
  const { accounts, currentUser } = useAuth();
  const { allProjects, allTasks } = useTasks();
  // The open tab lives in the address (?tab=), so a refresh stays on it. An unknown value falls back to Chat below.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'chat';
  const setTab = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', key);
    setSearchParams(next, { replace: true });
  };

  const isAdmin = isAdminOf(group, currentUser?.id);
  const isOwner = currentUser?.id === group.ownerId;
  const requests = isAdmin ? joinRequests.filter((r) => r.groupId === group.id).length : 0;
  const members = group.memberIds.map((id) => accounts.find((a) => a.id === id)).filter(Boolean);

  const teamTasks = allTasks.filter((t) => t.groupId === group.id);
  const toReview = isAdmin ? teamTasks.filter((t) => t.status === 'review').length : 0;

  const tabs = [
    { key: 'chat', label: 'Chat', icon: MessagesSquare, count: messages.filter((m) => m.groupId === group.id).length },
    { key: 'projects', label: 'Projects', icon: FolderKanban, count: allProjects.filter((p) => p.groupId === group.id && !p.archived).length },
    { key: 'announcements', label: 'Announcements', icon: Megaphone, count: teamAnnouncements.filter((a) => a.groupId === group.id).length },
    ...(isAdmin ? [{ key: 'assign', label: toReview > 0 ? `Assign task · ${toReview} to review` : 'Assign task', icon: ClipboardList }] : []),
    { key: 'reports', label: 'Reports', icon: BarChart3 },
    { key: 'members', label: requests > 0 ? `Members · ${requests} request${requests === 1 ? '' : 's'}` : 'Members', icon: Users, count: members.length },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'chat';

  return (
    <div className="space-y-4 min-w-0">
      <button
        onClick={onBackToList}
        className="inline-flex items-center gap-2 rounded-full border border-ink-500/15 dark:border-white/10 bg-white dark:bg-surface-darkcard shadow-soft px-3.5 py-1.5 text-fluid-xs font-medium text-ink-700 dark:text-ink-300 hover:bg-ink-500/5 transition-colors"
      >
        <ArrowLeft size={14} /> All teams
      </button>

      <div className={`${panelClass} p-4 overflow-hidden relative`}>
        <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-brand-500/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <TeamIcon id={group.id} name={group.name} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-fluid-lg text-ink-900 dark:text-white truncate">{group.name}</h2>
            <p className="text-fluid-xs text-ink-500 truncate">{group.description || 'No description yet.'}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Badge tone={group.visibility === 'public' ? 'brand' : 'neutral'}>
              {group.visibility === 'public' ? <Globe2 size={11} /> : <Lock size={11} />}
              {group.visibility === 'public' ? 'Public' : 'Private'}
            </Badge>
            <Badge tone={isOwner ? 'amber' : isAdmin ? 'brand' : 'neutral'}>{isOwner ? 'Owner' : isAdmin ? 'Group admin' : 'Member'}</Badge>
          </div>
        </div>
        <div data-tour="team-tabs" className="mt-3 -mb-1 overflow-x-auto">
          <Tabs tabs={tabs} active={active} onChange={setTab} />
        </div>
      </div>

      {active === 'chat' && <ChatTab key={group.id} group={group} members={members} isAdmin={isAdmin} />}
      {active === 'projects' && <TeamProjectsTab key={group.id} group={group} isAdmin={isAdmin} />}
      {active === 'announcements' && <AnnouncementsTab group={group} isAdmin={isAdmin} />}
      {active === 'assign' && isAdmin && <AssignTaskTab key={group.id} group={group} members={members} />}
      {active === 'reports' && <TeamReportsTab key={group.id} group={group} members={members} />}
      {active === 'members' && <MembersTab group={group} members={members} isAdmin={isAdmin} onGone={onGone} />}
    </div>
  );
}
