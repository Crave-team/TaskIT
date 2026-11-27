import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useApi } from './ApiContext';

const GroupContext = createContext(null);

/** A team's owner is always an admin; others become admins when promoted. */
export const isAdminOf = (group, accountId) =>
  Boolean(group) && (group.ownerId === accountId || (group.adminIds || []).includes(accountId));

/**
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'public' | 'private'} visibility
 * @property {string} ownerId - the team's owner (creator/leader), a user id
 * @property {string[]} adminIds
 * @property {string[]} memberIds
 * @property {{ id: string, name: string }[]} roles - the job roles the admins defined
 * @property {Record<string, string>} memberRoles - member id -> the id of the role they hold
 * @property {string} inviteCode
 * @property {string} createdAt
 */

/**
 * Teams, join requests, announcements and chat — a thin adapter over `api.teams`.
 *
 * The site's single `accountRole: 'admin'` is NOT a team's owner: any member can create a team and
 * lead it. Every rule (who can approve, remove, post, delete, disband) is enforced by the team
 * service; the UI only mirrors it. Who is acting always comes from the session, which is why none of
 * these functions take an "actor" argument any more.
 *
 * Teams you have not joined arrive as stripped Discover cards (`memberCount`, empty member lists).
 */
export function GroupProvider({ children }) {
  const { snapshot, run, attempt, api } = useApi();
  const [older, setOlder] = useState({}); // groupId -> earlier chat messages loaded on demand

  const createGroup = useCallback((input) => run((a) => a.teams.createGroup(input)), [run]);
  const updateGroup = useCallback((groupId, patch) => run((a) => a.teams.updateGroup(groupId, patch)), [run]);
  /** Owner (or the site admin) disbands a team; the service removes its tasks, projects, chat and requests too. */
  const deleteGroup = useCallback((groupId) => run((a) => a.teams.deleteGroup(groupId)), [run]);
  const regenerateInviteCode = useCallback((groupId) => run((a) => a.teams.regenerateInviteCode(groupId)), [run]);

  /** Joining files a request that a team admin must approve. Resolves `{ success, group?, pending?, error? }`. */
  const joinByCode = useCallback(async (code, roleId = '') => {
    const r = await attempt((a) => a.teams.joinByCode(code, roleId));
    return r.success ? { success: true, ...r.data } : r;
  }, [attempt]);
  const joinPublicGroup = useCallback(async (groupId, roleId = '') => {
    const r = await attempt((a) => a.teams.joinPublicGroup(groupId, roleId));
    return r.success ? { success: true, ...r.data } : r;
  }, [attempt]);

  const approveJoinRequest = useCallback((requestId) => run((a) => a.teams.approveJoinRequest(requestId)), [run]);
  const declineJoinRequest = useCallback((requestId) => run((a) => a.teams.declineJoinRequest(requestId)), [run]);
  const cancelJoinRequest = useCallback((groupId) => run((a) => a.teams.cancelJoinRequest(groupId)), [run]);
  const kickMember = useCallback((groupId, accountId) => run((a) => a.teams.kickMember(groupId, accountId)), [run]);
  const promoteMember = useCallback((groupId, accountId) => run((a) => a.teams.promoteMember(groupId, accountId)), [run]);
  const demoteMember = useCallback((groupId, accountId) => run((a) => a.teams.demoteMember(groupId, accountId)), [run]);
  const addRole = useCallback((groupId, name) => run((a) => a.teams.addRole(groupId, name)), [run]);
  const removeRole = useCallback((groupId, roleId) => run((a) => a.teams.removeRole(groupId, roleId)), [run]);
  /** Admin only. For someone else it is a proposal they must accept (`answerRoleChange`); an admin's own role applies at once. */
  const proposeRoleChange = useCallback((groupId, accountId, roleId) => run((a) => a.teams.proposeRoleChange(groupId, accountId, roleId)), [run]);
  const answerRoleChange = useCallback((changeId, accept) => run((a) => a.teams.answerRoleChange(changeId, accept)), [run]);
  const cancelRoleChange = useCallback((changeId) => run((a) => a.teams.cancelRoleChange(changeId)), [run]);
  const leaveGroup = useCallback((groupId) => run((a) => a.teams.leaveGroup(groupId)), [run]);

  const postTeamAnnouncement = useCallback((groupId, text) => run((a) => a.teams.postTeamAnnouncement(groupId, text)), [run]);
  const deleteTeamAnnouncement = useCallback((id) => run((a) => a.teams.deleteTeamAnnouncement(id)), [run]);

  /** `mentionIds` are the teammates tagged in the message; the service notifies them. */
  const sendMessage = useCallback((groupId, { text = '', image = null, replyTo = null, mentionIds = [] }) =>
    run((a) => a.teams.sendMessage(groupId, { text, image, replyTo, mentionIds })), [run]);
  const reactToMessage = useCallback((messageId, emoji) => run((a) => a.teams.reactToMessage(messageId, emoji)), [run]);
  const deleteMessage = useCallback((messageId) => run((a) => a.teams.deleteMessage(messageId)), [run]);

  /** Loads the page of chat before the oldest message currently shown (the snapshot holds only the latest page). */
  const loadEarlierMessages = useCallback(async (groupId) => {
    const shown = [...(older[groupId] || []), ...snapshot.messages.filter((m) => m.groupId === groupId)];
    const oldest = shown.reduce((min, m) => (!min || m.id < min ? m.id : min), null);
    const page = await api.teams.listMessages(groupId, { before: oldest });
    setOlder((o) => ({ ...o, [groupId]: [...page, ...(o[groupId] || [])] }));
    return page.length;
  }, [api, older, snapshot.messages]);

  const messages = useMemo(() => {
    const byId = new Map();
    Object.values(older).flat().forEach((m) => byId.set(m.id, m));
    snapshot.messages.forEach((m) => byId.set(m.id, m));
    return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }, [older, snapshot.messages]);

  const value = {
    groups: snapshot.groups,
    createGroup,
    updateGroup,
    deleteGroup,
    regenerateInviteCode,
    joinByCode,
    joinPublicGroup,
    joinRequests: snapshot.joinRequests,
    approveJoinRequest,
    declineJoinRequest,
    cancelJoinRequest,
    kickMember,
    promoteMember,
    demoteMember,
    addRole,
    removeRole,
    proposeRoleChange,
    answerRoleChange,
    cancelRoleChange,
    roleChanges: snapshot.roleChanges,
    leaveGroup,
    messages,
    loadEarlierMessages,
    teamAnnouncements: snapshot.teamAnnouncements,
    postTeamAnnouncement,
    deleteTeamAnnouncement,
    sendMessage,
    reactToMessage,
    deleteMessage,
  };

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroups() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroups must be used within a GroupProvider');
  return ctx;
}
