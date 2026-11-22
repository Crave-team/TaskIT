import { useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useGroups } from '../../context/GroupContext';
import { useTasks } from '../../context/TaskContext';

/**
 * Name lookups the admin overview pages share: who owns a task/project, which
 * team it belongs to, and which project a task is in.
 */
export function useAdminLookups() {
  const { accounts } = useAuth();
  const { groups } = useGroups();
  const { everyProject } = useTasks();

  const accountName = useCallback((id) => accounts.find((a) => a.id === id)?.name ?? 'Deleted user', [accounts]);
  const teamName = useCallback((groupId) => groups.find((g) => g.id === groupId)?.name ?? 'Disbanded team', [groups]);
  const projectName = useCallback((id) => everyProject.find((p) => p.id === id)?.name ?? '—', [everyProject]);
  // Team tasks belong to their assignee; personal ones to whoever created them.
  const taskOwner = useCallback((t) => (t.groupId ? (t.assignee && t.assignee !== 'Unassigned' ? t.assignee : 'Unassigned') : accountName(t.ownerId)), [accountName]);
  const scopeOf = useCallback((t) => (t.groupId ? `Team · ${teamName(t.groupId)}` : 'My Workspace'), [teamName]);

  return { accountName, teamName, projectName, taskOwner, scopeOf };
}
