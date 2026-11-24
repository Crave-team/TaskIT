import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useNavigate } from 'react-router-dom';
import { Search, X, CornerDownLeft, LayoutDashboard, KanbanSquare, Users2, CalendarDays, Users, Settings, FolderKanban, ListTodo, MessagesSquare, Megaphone, ClipboardList, BarChart3, UserCog, SlidersHorizontal, ScrollText, UserRound } from 'lucide-react';
import { useTasks } from '../../context/TaskContext';
import { useGroups } from '../../context/GroupContext';
import { useAuth } from '../../context/AuthContext';
import { STATUS_META } from '../../data/mockData';
import { scoreFields, scoreTokens } from '../../utils/search';

const PAGES = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, keywords: ['home', 'overview'] },
  { label: 'My Workspace', to: '/tasks', icon: KanbanSquare, keywords: ['tasks', 'projects', 'kanban', 'board'] },
  { label: 'Calendar', to: '/calendar', icon: CalendarDays, keywords: ['deadlines', 'dates', 'schedule', 'reminders'] },
  { label: 'Team', to: '/team', icon: Users, keywords: ['teams', 'groups', 'join', 'discover'] },
  { label: 'Profile & settings', to: '/settings', icon: Settings, keywords: ['account', 'password', 'theme', 'dark mode'] },
];

// Pages only the site admin has.
const ADMIN_PAGES = [
  { label: 'Users', to: '/users', icon: UserCog, keywords: ['accounts', 'people', 'ban', 'roles', 'admins'] },
  { label: 'System Settings', to: '/system', icon: SlidersHorizontal, keywords: ['security', '2fa', 'two-step', 'notifications', 'alerts'] },
  { label: 'Activity Log', to: '/activity', icon: ScrollText, keywords: ['logs', 'history', 'audit'] },
];
// Admins have no personal board of tasks to browse here, and their Team page is an overview, not a tab workspace.
const ADMIN_PAGE_KEYS = new Set(['/dashboard', '/tasks', '/calendar', '/team', '/settings']);

// The tabs inside a team, so a search can open the exact one (…/team?team=<id>&tab=<key>).
const TEAM_TABS = [
  { key: 'chat', label: 'Chat', icon: MessagesSquare, keywords: ['messages', 'conversation', 'discussion'] },
  { key: 'projects', label: 'Projects', icon: FolderKanban, keywords: ['tasks', 'kanban', 'board', 'gantt', 'timeline'] },
  { key: 'announcements', label: 'Announcements', icon: Megaphone, keywords: ['news', 'notice', 'updates'] },
  { key: 'assign', label: 'Assign task', icon: ClipboardList, keywords: ['assign', 'review', 'create task', 'delegate'], adminOnly: true },
  { key: 'reports', label: 'Reports', icon: BarChart3, keywords: ['report', 'analytics', 'charts', 'stats', 'statistics', 'progress', 'diagrams'] },
  { key: 'members', label: 'Members', icon: Users, keywords: ['people', 'invite', 'join requests', 'requests', 'code'] },
];

const teamLink = (groupId, tab, extra = {}) => {
  const params = new URLSearchParams({ team: groupId, ...(tab ? { tab } : {}), ...extra });
  return `/team?${params.toString()}`;
};

const SECTION_LABEL = { page: 'Pages', teamtab: 'Team sections', project: 'Projects', task: 'Tasks', group: 'Teams', announcement: 'Announcements', message: 'Team chat', member: 'Team members', user: 'Users' };
const SECTION_ORDER = ['page', 'teamtab', 'project', 'task', 'group', 'announcement', 'message', 'member', 'user'];

/**
 * Header search with typo-tolerant suggestions. Typing shows matching pages,
 * projects, tasks and groups ("calender" still finds Calendar); picking one —
 * by click or ↑/↓ + Enter — jumps straight to it. Results inside a team open the exact place:
 * "reports" opens the Reports tab of that team, an announcement opens that team's Announcements tab,
 * a team task opens in its team's Projects tab, and so on.
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { tasks, allTasks, allProjects } = useTasks();
  const { groups, messages, teamAnnouncements } = useGroups();
  const { currentUser, accounts } = useAuth();
  const [query, setQuery] = usePersistedState('globalSearch.query', '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const isAdmin = currentUser?.accountRole === 'admin';

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const out = [];
    const meId = currentUser?.id;
    const groupName = (id) => groups.find((g) => g.id === id)?.name ?? 'Team';
    // Teams whose insides I can open. The site admin's Team page is an overview, so it never gets tab links.
    const myTeams = isAdmin ? [] : groups.filter((g) => g.memberIds.includes(meId));
    const myTeamIds = new Set(myTeams.map((g) => g.id));
    const adminOfTeam = (g) => g.ownerId === meId || (g.adminIds || []).includes(meId);

    const pages = isAdmin ? [...PAGES.filter((p) => ADMIN_PAGE_KEYS.has(p.to)), ...ADMIN_PAGES] : PAGES;
    pages.forEach((p) => {
      const m = scoreFields(q, [p.label, ...p.keywords]);
      if (m.score) out.push({ type: 'page', id: p.to, title: p.label, subtitle: 'Go to page', icon: p.icon, to: p.to, ...m });
    });

    // Each tab of each of my teams, so "reports" opens the Reports tab of the right team.
    myTeams.forEach((g) => {
      TEAM_TABS.filter((t) => !t.adminOnly || adminOfTeam(g)).forEach((t) => {
        const m = scoreTokens(q, [t.label, ...t.keywords, g.name]);
        if (m.score) out.push({ type: 'teamtab', id: `${g.id}:${t.key}`, title: `${t.label} · ${g.name}`, subtitle: `Open the ${t.label} tab of this team`, icon: t.icon, to: teamLink(g.id, t.key), ...m });
      });
    });

    allProjects.filter((p) => !p.groupId || groups.some((g) => g.id === p.groupId && (isAdmin || g.memberIds.includes(meId)))).forEach((p) => {
      const m = scoreFields(q, [p.name, p.description || '']);
      if (!m.score) return;
      const inTeam = p.groupId && myTeamIds.has(p.groupId);
      out.push({
        type: 'project', id: p.id, title: p.name,
        subtitle: p.groupId ? `Team project · ${groupName(p.groupId)}${inTeam ? ' · Projects tab' : ''}` : p.archived ? 'Archived project' : 'Project',
        icon: FolderKanban,
        to: p.groupId ? (inTeam ? teamLink(p.groupId, 'projects', { project: p.id }) : '/team') : `/tasks?project=${p.id}`,
        ...m,
      });
    });

    // Personal tasks open in My Workspace; team tasks (the ones I am allowed to read) open inside their team's Projects tab.
    tasks.filter((t) => !t.groupId).forEach((t) => {
      const m = scoreFields(q, [t.title, ...(t.tags || []), t.description || '']);
      if (m.score) {
        const proj = allProjects.find((p) => p.id === t.projectId);
        out.push({ type: 'task', id: t.id, title: t.title, subtitle: `${proj?.name ?? 'Task'} · ${STATUS_META[t.status]?.label ?? t.status}`, icon: ListTodo, to: `/tasks?project=${t.projectId}&task=${t.id}`, ...m });
      }
    });
    allTasks.filter((t) => t.groupId && myTeamIds.has(t.groupId)).forEach((t) => {
      const m = scoreFields(q, [t.title, ...(t.tags || []), t.description || '']);
      if (!m.score) return;
      const proj = allProjects.find((p) => p.id === t.projectId);
      out.push({ type: 'task', id: t.id, title: t.title, subtitle: `${groupName(t.groupId)} · ${proj?.name ?? 'Project'} · ${STATUS_META[t.status]?.label ?? t.status}`, icon: ListTodo, to: teamLink(t.groupId, 'projects', { project: t.projectId, task: t.id }), ...m });
    });

    groups
      .filter((g) => isAdmin || g.memberIds.includes(meId) || g.visibility === 'public')
      .forEach((g) => {
        const m = scoreFields(q, [g.name, g.description || '']);
        if (m.score) out.push({ type: 'group', id: g.id, title: g.name, subtitle: 'Team', icon: Users2, to: isAdmin ? '/team' : teamLink(g.id), ...m });
      });

    // What is written inside my teams: announcements and chat go to their own tab, people to Members.
    teamAnnouncements.filter((a) => myTeamIds.has(a.groupId)).forEach((a) => {
      const m = scoreFields(q, [a.text || '']);
      if (m.score) out.push({ type: 'announcement', id: a.id, title: (a.text || '').slice(0, 80), subtitle: `${groupName(a.groupId)} · Announcements tab`, icon: Megaphone, to: teamLink(a.groupId, 'announcements'), ...m });
    });
    messages.filter((msg) => myTeamIds.has(msg.groupId) && !msg.deleted && msg.text).forEach((msg) => {
      const m = scoreFields(q, [msg.text]);
      if (m.score) out.push({ type: 'message', id: msg.id, title: msg.text.slice(0, 80), subtitle: `${groupName(msg.groupId)} · Chat tab`, icon: MessagesSquare, to: teamLink(msg.groupId, 'chat'), ...m });
    });
    myTeams.forEach((g) => {
      g.memberIds.forEach((uid) => {
        const acc = accounts.find((a) => a.id === uid);
        if (!acc) return;
        const m = scoreFields(q, [acc.name]);
        if (m.score) out.push({ type: 'member', id: `${g.id}:${uid}`, title: acc.name, subtitle: `Member of ${g.name} · Members tab`, icon: UserRound, to: teamLink(g.id, 'members'), ...m });
      });
    });

    // The site admin can jump to a person in Users.
    if (isAdmin) {
      accounts.forEach((acc) => {
        const m = scoreFields(q, [acc.name, acc.email || '']);
        if (m.score) out.push({ type: 'user', id: acc.id, title: acc.name, subtitle: acc.email || 'User', icon: UserRound, to: '/users', ...m });
      });
    }

    // Best matches first overall, but keep each section together and capped.
    const capped = [];
    SECTION_ORDER.forEach((type) => {
      out.filter((r) => r.type === type).sort((a, b) => b.score - a.score).slice(0, 4).forEach((r) => capped.push(r));
    });
    return capped;
  }, [query, tasks, allTasks, allProjects, groups, accounts, teamAnnouncements, messages, currentUser, isAdmin]);

  const onlyFuzzy = results.length > 0 && results.every((r) => r.fuzzy);
  const top = [...results].sort((a, b) => b.score - a.score)[0];

  const go = (r) => {
    setOpen(false);
    setQuery('');
    navigate(r.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  const showPanel = open && query.trim() !== '';
  let lastType = null;

  return (
    <div ref={wrapRef} data-tour="global-search" className="relative hidden sm:block w-full max-w-md">
      <div className="flex items-center gap-2 text-ink-500 bg-ink-500/5 dark:bg-white/5 border border-ink-500/10 dark:border-white/10 rounded-full px-3.5 py-2 w-full focus-within:ring-2 focus-within:ring-brand-500/40">
        <Search size={15} className="shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="global-search-list"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search tasks, teams, reports, pages…"
          aria-label="Search"
          className="w-full bg-transparent text-fluid-xs text-ink-900 dark:text-white placeholder:text-ink-500 focus:outline-none !border-0 !shadow-none !h-auto"
        />
        {query && (
          <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search" className="shrink-0 hover:text-ink-900 dark:hover:text-white">
            <X size={13} />
          </button>
        )}
      </div>

      {showPanel && (
        <div
          id="global-search-list"
          role="listbox"
          className="absolute left-0 top-full mt-2 w-full min-w-[20rem] max-h-[26rem] overflow-y-auto z-40 rounded-xl bg-surface-card dark:bg-surface-darkcard border border-ink-500/10 dark:border-white/10 shadow-elevated py-1.5"
        >
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-fluid-sm text-ink-500">No results for “{query.trim()}”.</p>
          ) : (
            <>
              {onlyFuzzy && top && (
                <button
                  onClick={() => go(top)}
                  className="w-full text-left px-4 py-2 text-fluid-xs text-ink-500 hover:bg-ink-500/5 dark:hover:bg-white/5"
                >
                  Did you mean <span className="font-semibold text-brand-700 dark:text-brand-300">{top.title}</span>?
                </button>
              )}
              {results.map((r, i) => {
                const header = r.type !== lastType;
                lastType = r.type;
                const Icon = r.icon;
                return (
                  <div key={`${r.type}-${r.id}`}>
                    {header && (
                      <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">{SECTION_LABEL[r.type]}</p>
                    )}
                    <button
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${i === active ? 'bg-brand-500/10' : ''}`}
                    >
                      <span className="w-7 h-7 rounded-lg bg-ink-500/8 dark:bg-white/8 flex items-center justify-center shrink-0">
                        <Icon size={14} className="text-ink-700 dark:text-ink-300" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-fluid-sm font-medium text-ink-900 dark:text-white truncate">{r.title}</span>
                        <span className="block text-fluid-xs text-ink-500 truncate">{r.subtitle}</span>
                      </span>
                      {i === active && <CornerDownLeft size={13} className="text-ink-500 shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
