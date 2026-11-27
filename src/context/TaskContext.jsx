import { usePersistedState } from '../hooks/usePersistedState';
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useApi } from './ApiContext';
import { todayISO } from '../data/mockData';

const TaskContext = createContext(null);

/**
 * @typedef {Object} Filters
 * @property {string} search
 * @property {string} priority - '' | 'low' | 'medium' | 'high'
 * @property {string} status - '' | 'todo' | 'in-progress' | 'review' | 'done'
 * @property {string} tag - '' or a tag string
 * @property {string} projectId - '' or a project id
 * @property {string} assignee - '' or an assignee name
 * @property {string} dueWithin - '' | '7' | '30' | 'overdue'
 */

const emptyFilters = {
  search: '',
  priority: '',
  status: '',
  tag: '',
  projectId: '',
  assignee: '',
  dueWithin: '',
};

/**
 * The workspace for the signed-in person, as a thin adapter over the data layer.
 *
 * READS come from the server-filtered snapshot (see `api/services/syncService.js`): you only ever
 * receive what you are allowed to see, so there is no client-side privacy filtering to get wrong.
 * WRITES are `api.tasks.*` calls; the services enforce the permissions, create the notifications,
 * write the audit log and run the cascades, then the snapshot is refreshed.
 *
 * People are referenced by ID (`ownerId`, `assigneeId`, `byId`...). Each task also carries the
 * display `assignee` name, filled in by the server, for rendering only.
 *
 * Slices: `tasks` = tasks on MY plate (mine + team tasks assigned to me), `personalTasks` = My
 * Workspace only, `allTasks` = everything I may read (team admins see their whole team; the site admin
 * sees all) — the team-admin and admin screens apply their own role checks on top.
 */
export function TaskProvider({ children }) {
  const { currentUser: me, systemSettings } = useAuth();
  const { snapshot, run, api, activityLimit, loadMoreActivity } = useApi();
  const [filters, setFilters] = usePersistedState('workspace.filters', emptyFilters); // search/filters survive a refresh

  // "Today" as a YYYY-MM-DD key, re-checked every minute so deadline logic moves on at midnight.
  const [dayKey, setDayKey] = useState(todayISO);
  useEffect(() => {
    const id = setInterval(() => setDayKey((k) => {
      const now = todayISO();
      return now === k ? k : now;
    }), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Don't carry one person's search/filters over to the next account that signs in.
  const meId = me?.id ?? null;
  const [filtersOwner, setFiltersOwner] = useState(meId);
  if (filtersOwner !== meId) {
    setFiltersOwner(meId);
    setFilters(emptyFilters);
  }

  const tasks = snapshot.tasks;
  const projects = snapshot.projects;

  // ---- Writes (each is one service call; the snapshot refreshes afterwards) ----------------

  const createTask = useCallback((task, options = {}) => run((a) => a.tasks.createTask(task, options)), [run]);
  /** Creates several team tasks and lets the SERVER choose who gets each "Auto" one; resolves to [{ task, decision }]. */
  const createTeamTasks = useCallback((projectId, rows) => run((a) => a.tasks.createTeamTasks(projectId, rows)), [run]);
  const updateTask = useCallback((id, patch) => run((a) => a.tasks.updateTask(id, patch)), [run]);
  const deleteTask = useCallback((id) => run((a) => a.tasks.deleteTask(id)), [run]);
  const deleteTasks = useCallback((ids) => run((a) => a.tasks.deleteTasks(ids)), [run]);
  const moveTaskStatus = useCallback((id, status) => run((a) => a.tasks.moveTaskStatus(id, status)), [run]);

  const addSubtask = useCallback((taskId, title) => run((a) => a.tasks.addSubtask(taskId, title)), [run]);
  const toggleSubtask = useCallback((taskId, subtaskId) => run((a) => a.tasks.toggleSubtask(taskId, subtaskId)), [run]);
  const removeSubtask = useCallback((taskId, subtaskId) => run((a) => a.tasks.removeSubtask(taskId, subtaskId)), [run]);
  const addComment = useCallback((taskId, text, options) => run((a) => a.tasks.addComment(taskId, text, options)), [run]);
  /** `file` is the record returned by `api.files.uploadFile` (plus display `type`/`size`). */
  const addAttachment = useCallback((taskId, file) => run((a) => a.tasks.addAttachment(taskId, file)), [run]);
  const removeAttachment = useCallback((taskId, attachmentId) => run((a) => a.tasks.removeAttachment(taskId, attachmentId)), [run]);
  const addTimeEntry = useCallback((taskId, minutes, note) => run((a) => a.tasks.addTimeEntry(taskId, minutes, note)), [run]);
  const setEstimate = useCallback((taskId, minutes) => run((a) => a.tasks.setEstimate(taskId, minutes)), [run]);
  const startTimer = useCallback((taskId) => run((a) => a.tasks.startTimer(taskId)), [run]);
  const stopTimer = useCallback((taskId, note) => run((a) => a.tasks.stopTimer(taskId, note)), [run]);

  // Team task workflow
  const moveTeamTask = useCallback((id, status) => run((a) => a.tasks.moveTeamTask(id, status)), [run]);
  const turnInTask = useCallback((id, submission) => run((a) => a.tasks.turnInTask(id, submission)), [run]);
  const saveTurnInDraft = useCallback((id, submission) => run((a) => a.tasks.saveTurnInDraft(id, submission)), [run]);
  const undoTurnIn = useCallback((id) => run((a) => a.tasks.undoTurnIn(id)), [run]);
  const approveTask = useCallback((id) => run((a) => a.tasks.approveTask(id)), [run]);
  const returnTask = useCallback((id, note) => run((a) => a.tasks.returnTask(id, note)), [run]);
  /** `assigneeId` is a member's user id, or null for Unassigned. */
  const reassignTask = useCallback((id, assigneeId) => run((a) => a.tasks.reassignTask(id, assigneeId)), [run]);
  const swapTaskAssignees = useCallback((idA, idB) => run((a) => a.tasks.swapTaskAssignees(idA, idB)), [run]);

  // Projects
  const createProject = useCallback((project) => run((a) => a.tasks.createProject(project)), [run]);
  const updateProject = useCallback((id, patch) => run((a) => a.tasks.updateProject(id, patch)), [run]);
  const archiveProject = useCallback((id, archived = true) => run((a) => a.tasks.archiveProject(id, archived)), [run]);
  const deleteProject = useCallback((id) => run((a) => a.tasks.deleteProject(id)), [run]);
  const addMilestone = useCallback((projectId, title, date) => run((a) => a.tasks.addMilestone(projectId, title, date)), [run]);
  const toggleMilestone = useCallback((projectId, milestoneId) => run((a) => a.tasks.toggleMilestone(projectId, milestoneId)), [run]);
  const removeMilestone = useCallback((projectId, milestoneId) => run((a) => a.tasks.removeMilestone(projectId, milestoneId)), [run]);

  // Reminders
  const addReminder = useCallback((reminder) => run((a) => a.tasks.addReminder(reminder)), [run]);
  const updateReminder = useCallback((id, patch) => run((a) => a.tasks.updateReminder(id, patch)), [run]);
  const deleteReminder = useCallback((id) => run((a) => a.tasks.deleteReminder(id)), [run]);

  // Notifications
  const markNotificationRead = useCallback((id) => run((a) => a.notifications.markNotificationRead(id), { quiet: true }), [run]);
  const markAllNotificationsRead = useCallback(() => run((a) => a.notifications.markAllNotificationsRead(), { quiet: true }), [run]);
  const clearNotifications = useCallback(() => run((a) => a.notifications.clearNotifications(), { quiet: true }), [run]);

  /** Records that the signed-in person opened a page/team (admin Activity Log). Never interrupts. */
  const logAccess = useCallback((action, target, scope = 'other') => {
    if (!meId) return;
    api.activity.logAccess({ action, target, scope }).catch(() => {});
  }, [api, meId]);

  // ---- Filters -----------------------------------------------------------------------------

  const setFilter = useCallback((key, value) => setFilters((prev) => ({ ...prev, [key]: value })), [setFilters]);
  const resetFilters = useCallback(() => setFilters(emptyFilters), [setFilters]);

  // ---- Slices ------------------------------------------------------------------------------

  // On my plate: personal tasks I own, team tasks assigned to me.
  const myTasks = useMemo(
    () => (me ? tasks.filter((t) => (t.groupId ? t.assigneeId === me.id : t.ownerId === me.id)) : []),
    [tasks, me]
  );
  // "My Workspace" data only: personal tasks, never team tasks (those live in the Team hub).
  const personalTasks = useMemo(() => myTasks.filter((t) => !t.groupId), [myTasks]);
  const myProjects = useMemo(
    () => (me ? projects.filter((p) => p.groupId || p.ownerId === me.id) : []),
    [projects, me]
  );

  // Running timers now live ON the task (`timerStartedAt`), so they survive reloads and devices.
  const timers = useMemo(() => {
    const map = {};
    myTasks.forEach((t) => { if (t.timerStartedAt) map[t.id] = t.timerStartedAt; });
    return map;
  }, [myTasks]);

  const allTags = useMemo(() => {
    const set = new Set();
    personalTasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [personalTasks]);

  const allAssignees = useMemo(() => {
    const set = new Set();
    personalTasks.forEach((t) => t.assignee && set.add(t.assignee));
    return Array.from(set).sort();
  }, [personalTasks]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    return personalTasks.filter((t) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${t.title} ${t.description} ${t.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.priority && t.priority !== filters.priority) return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.tag && !t.tags.includes(filters.tag)) return false;
      if (filters.projectId && t.projectId !== filters.projectId) return false;
      if (filters.assignee && t.assignee !== filters.assignee) return false;
      if (filters.dueWithin) {
        // Anchor to local midnight instead of letting the Date constructor parse "YYYY-MM-DD" as UTC.
        const due = new Date(`${t.dueDate}T00:00:00`);
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        if (filters.dueWithin === 'overdue' && !(diffDays < 0 && t.status !== 'done')) return false;
        if (filters.dueWithin === '7' && !(diffDays >= 0 && diffDays <= 7)) return false;
        if (filters.dueWithin === '30' && !(diffDays >= 0 && diffDays <= 30)) return false;
      }
      return true;
    });
  }, [personalTasks, filters]);

  // ---- Derived progress helpers ------------------------------------------------------------

  /** 0-100 completion percentage for a task, from its subtasks (or status if none). */
  const taskProgress = useCallback((task) => {
    if (task.subtasks && task.subtasks.length > 0) {
      const done = task.subtasks.filter((s) => s.done).length;
      return Math.round((done / task.subtasks.length) * 100);
    }
    return task.status === 'done' ? 100 : task.status === 'review' ? 75 : task.status === 'in-progress' ? 40 : 0;
  }, []);

  /** 0-100 completion percentage for a project, from the share of its tasks marked done. */
  const projectProgress = useCallback((projectId) => {
    const projTasks = tasks.filter((t) => t.projectId === projectId);
    if (projTasks.length === 0) return 0;
    return Math.round((projTasks.filter((t) => t.status === 'done').length / projTasks.length) * 100);
  }, [tasks]);

  // ---- Deadline notices -------------------------------------------------------------------
  // The service creates (once, idempotently) an "overdue" notice for each of my open tasks past due and
  // a "due today" and a "due tomorrow" notice for each open task / calendar reminder due then. Here we just ask it to
  // re-check whenever the relevant data changes, and read the notices that still want to pop up.
  // On only when the admin's site-wide switch AND my own "Due-date reminders" preference are on. The pop-ups check this
  // too (not just the server), so they disappear the moment either switch is turned off, before the next sync answers.
  const deadlineAlertsOn = Boolean(systemSettings.notifyDeadlines) && (me?.prefs?.dueReminders ?? true);
  const dailyDigestOn = me?.prefs?.dailyDigest ?? true;
  const dueSignature = useMemo(
    () => [
      myTasks.map((t) => `${t.id}:${t.dueDate}:${t.status}`).join(','),
      snapshot.reminders.map((r) => `${r.id}:${r.date}`).join(','),
      deadlineAlertsOn,
      dailyDigestOn,
    ].join('|'),
    [myTasks, snapshot.reminders, deadlineAlertsOn, dailyDigestOn]
  );
  useEffect(() => {
    if (!meId) return;
    run((a) => a.notifications.syncDeadlines({ today: dayKey }), { quiet: true });
  }, [meId, dayKey, dueSignature, run]);

  const pending = useMemo(
    () => snapshot.notifications.filter((n) => n.popup?.pending).map((n) => ({ key: n.id, type: n.type, ...n.popup })),
    [snapshot.notifications]
  );
  /** Overdue tasks that have not been dismissed yet (drives the overdue pop-up). */
  const unacknowledgedOverdue = useMemo(() => pending.filter((p) => p.type === 'overdue'), [pending]);
  /** Tasks / reminders due today or tomorrow that have not been dismissed yet (drives the due-date pop-up). */
  const unacknowledgedDueSoon = useMemo(() => pending.filter((p) => p.type === 'deadline'), [pending]);
  const acknowledgePopups = useCallback((keys) => run((a) => a.notifications.acknowledgePopups(keys), { quiet: true }), [run]);

  const unreadNotificationCount = useMemo(
    () => snapshot.notifications.filter((n) => !n.read).length,
    [snapshot.notifications]
  );

  const isSiteAdmin = me?.accountRole === 'admin';

  const value = {
    // On my plate: personal tasks + team tasks assigned to me.
    tasks: myTasks,
    // Only the personal (My Workspace) tasks — drives the dashboard and the workspace search.
    personalTasks,
    // Everything I may read (a team admin sees their team's tasks, the site admin everything).
    allTasks: tasks,
    // Every project I may read — used by the admin's overview pages and the team screens.
    everyProject: projects,
    // Personal projects only — team projects (with a groupId) live in the Team hub.
    projects: myProjects.filter((p) => !p.archived && !p.groupId),
    allProjects: myProjects,
    filteredTasks,
    filters,
    setFilter,
    resetFilters,
    allTags,
    allAssignees,
    createTask,
    createTeamTasks,
    updateTask,
    deleteTask,
    moveTaskStatus,
    addSubtask,
    toggleSubtask,
    removeSubtask,
    addComment,
    addAttachment,
    removeAttachment,
    addTimeEntry,
    setEstimate,
    moveTeamTask,
    turnInTask,
    saveTurnInDraft,
    undoTurnIn,
    approveTask,
    returnTask,
    deleteTasks,
    reassignTask,
    swapTaskAssignees,
    deadlineAlertsOn,
    unacknowledgedOverdue,
    unacknowledgedDueSoon,
    acknowledgePopups,
    createProject,
    updateProject,
    archiveProject,
    deleteProject,
    addMilestone,
    toggleMilestone,
    removeMilestone,
    taskProgress,
    projectProgress,
    notifications: snapshot.notifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    // Members: their own recent actions. Site admin: the whole audit trail (see `loadMoreActivity`).
    activityLog: isSiteAdmin ? [] : snapshot.activity,
    allActivityLog: isSiteAdmin ? snapshot.activity : [],
    canLoadMoreActivity: isSiteAdmin && snapshot.activity.length >= activityLimit,
    loadMoreActivity,
    logAccess,
    reminders: snapshot.reminders,
    addReminder,
    updateReminder,
    deleteReminder,
    timers,
    startTimer,
    stopTimer,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error('useTasks must be used within a TaskProvider');
  return ctx;
}
