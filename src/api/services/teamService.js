import { db, transaction } from '../repo.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import {
  nowISO, requireActor, isGroupAdmin, isGroupMember, adminIdsOf,
  logActivity, notify, releaseFile, cleanPage, isDuplicateKey,
} from '../core.js';
import { removeGroupWork, releaseMemberTasks } from './taskService.js';
import { config } from '../config.js';
import { newId } from '../ids.js';

/**
 * Teams: creation, membership and roles, join requests, announcements and chat.
 *
 * Powers (per team): the OWNER (creator), ADMINS (promoted members) and plain MEMBERS.
 * Job roles (per team, a different thing): the admins define a list of roles ("Frontend", "QA"...), every member holds
 * at most one, and a new task is created FOR a role: the server picks its assignee among that role's holders, splitting a
 * batch evenly (see `createTeamTasks`).
 * A newcomer picks their role when they ask to join. After that only an admin can change it, and the member must accept.
 * The site's own administrator is a different thing: they can read every team and disband one,
 * but do not lead any of them.
 *
 * Membership lists are changed with atomic set operations (`addToSet` / `pullValue`), never by
 * re-writing the list, so two approvals at once cannot undo each other.
 */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I, easy to read aloud
const isStr = (v) => typeof v === 'string';
const text = (v) => (isStr(v) ? v.trim() : '');
const need = (cond, message, field) => { if (!cond) throw badRequest(message, field); };
const MAX_ROLES = 30;
const roleNameOf = (v) => text(v).replace(/\s+/g, ' ').slice(0, 40);
const findRole = (group, roleId) => (isStr(roleId) ? (group.roles || []).find((r) => r.id === roleId) : undefined);
const randomCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

/** A fresh invite code not used by another team (the unique index on `inviteCode` is the final guard). */
async function newInviteCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = randomCode();
    if (!(await db.groups.findOne({ inviteCode: code }))) return code;
  }
  throw badRequest('Could not create an invite code, please try again.');
}

async function mustGroup(id) {
  const group = isStr(id) ? await db.groups.get(id) : null;
  if (!group) throw notFound('Team not found.');
  return group;
}
async function adminGroup(ctx, id) {
  const actor = await requireActor(ctx);
  const group = await mustGroup(id);
  if (!isGroupAdmin(group, actor.id)) throw forbidden('Only a team admin can do that.');
  return { actor, group };
}
async function ownerGroup(ctx, id) {
  const actor = await requireActor(ctx);
  const group = await mustGroup(id);
  if (group.ownerId !== actor.id) throw forbidden('Only the team owner can do that.');
  return { actor, group };
}

// ---------------------------------------------------------------- groups

export async function createGroup(ctx, { name, description = '', visibility = 'public' } = {}) {
  const actor = await requireActor(ctx);
  need(text(name), 'Give the team a name.', 'name');
  let group;
  for (let attempt = 0; !group; attempt += 1) {
    try {
      group = await db.groups.insert({
        name: text(name).slice(0, 100),
        description: text(description).slice(0, 1000),
        visibility: visibility === 'private' ? 'private' : 'public',
        ownerId: actor.id,
        adminIds: [actor.id],
        memberIds: [actor.id],
        roles: [],
        memberRoles: {},
        inviteCode: await newInviteCode(),
        createdAt: nowISO(),
      });
    } catch (e) {
      if (!isDuplicateKey(e) || attempt > 5) throw e; // another team grabbed the same code a moment ago: try a new one
    }
  }
  await logActivity(actor, 'created team', group.name, { scope: 'team' });
  return group;
}

export async function updateGroup(ctx, id, patch = {}) {
  const { group } = await ownerGroup(ctx, id);
  const next = {};
  if (patch.name !== undefined) {
    need(text(patch.name), 'Give the team a name.', 'name');
    next.name = text(patch.name).slice(0, 100);
  }
  if (patch.description !== undefined) next.description = text(patch.description).slice(0, 1000);
  if (patch.visibility !== undefined) next.visibility = patch.visibility === 'private' ? 'private' : 'public';
  return db.groups.update(group.id, next);
}

/** Owner or site admin. Takes the team's chat, announcements, requests, projects and tasks with it. */
export async function deleteGroup(ctx, id) {
  const actor = await requireActor(ctx);
  const group = await mustGroup(id);
  if (group.ownerId !== actor.id && actor.accountRole !== 'admin') throw forbidden('Only the team owner can disband a team.');
  await transaction(() => purgeGroup(group.id));
  await logActivity(actor, 'disbanded team', group.name, { scope: 'team' });
}

/** Internal: remove a team and everything that belongs to it. */
async function purgeGroup(groupId) {
  for (const m of await db.messages.removeWhere({ groupId })) await releaseFile(m.image?.fileId);
  await db.teamAnnouncements.removeWhere({ groupId });
  await db.joinRequests.removeWhere({ groupId });
  await db.roleChanges.removeWhere({ groupId });
  await removeGroupWork(groupId);
  await db.groups.remove(groupId);
}

export async function regenerateInviteCode(ctx, id) {
  const { group } = await ownerGroup(ctx, id);
  const updated = await db.groups.update(group.id, { inviteCode: await newInviteCode() });
  return updated.inviteCode;
}

// ---------------------------------------------------------------- joining

async function requestJoin(actor, group, roleId) {
  const brief = { id: group.id, name: group.name };
  if (isGroupMember(group, actor.id)) return { group: brief, alreadyMember: true };
  if (await db.joinRequests.findOne({ groupId: group.id, accountId: actor.id })) return { group: brief, pending: true, alreadyPending: true };
  // A team with roles asks every newcomer to choose one. Without a choice nothing is filed: the caller gets the list to show.
  const roles = group.roles || [];
  if (roles.length > 0 && !roleId) return { group: brief, roleRequired: true, roles };
  if (roles.length > 0) need(findRole(group, roleId), 'Pick one of the team\'s roles.', 'roleId');
  try {
    await db.joinRequests.insert({ groupId: group.id, accountId: actor.id, roleId: roles.length > 0 ? roleId : '', createdAt: nowISO() });
  } catch (e) {
    if (isDuplicateKey(e)) return { group: brief, pending: true, alreadyPending: true }; // double click: the unique index caught it
    throw e;
  }
  for (const id of adminIdsOf(group)) {
    await notify(id, { type: 'assignment', message: `${actor.name} asked to join ${group.name}.`, link: `/team?team=${group.id}` });
  }
  return { group: brief, pending: true };
}

/** Joining never adds you directly: it files a request a team admin must approve. */
export async function joinByCode(ctx, code, roleId = '') {
  const actor = await requireActor(ctx);
  need(isStr(code), 'Enter an invite code.');
  const group = await db.groups.findOne({ inviteCode: code.trim().toUpperCase() });
  if (!group) throw notFound('No team matches that code.');
  return requestJoin(actor, group, roleId);
}

export async function joinPublicGroup(ctx, groupId, roleId = '') {
  const actor = await requireActor(ctx);
  const group = await mustGroup(groupId);
  if (group.visibility !== 'public') throw forbidden('This team is private — ask for an invite link or code.');
  return requestJoin(actor, group, roleId);
}

export async function approveJoinRequest(ctx, requestId) {
  await requireActor(ctx); // authenticate before looking anything up, so a stranger learns nothing about which ids exist
  const request = isStr(requestId) ? await db.joinRequests.get(requestId) : null;
  if (!request) throw notFound('Request not found.');
  const { group } = await adminGroup(ctx, request.groupId);
  if (!(await db.users.get(request.accountId))) {
    await db.joinRequests.remove(requestId);
    throw notFound('That person no longer has an account.');
  }
  // The role they chose carries over, unless an admin removed it while the request waited (then they pick again later).
  const roleId = findRole(group, request.roleId) ? request.roleId : null;
  await db.groups.update(group.id, roleId ? { [`memberRoles.${request.accountId}`]: roleId } : {}, { addToSet: { memberIds: request.accountId } });
  await db.joinRequests.remove(requestId);
  await notify(request.accountId, { type: 'approved', message: `You were accepted into ${group.name}.`, link: `/team?team=${group.id}` });
}

export async function declineJoinRequest(ctx, requestId) {
  await requireActor(ctx); // authenticate before looking anything up, so a stranger learns nothing about which ids exist
  const request = isStr(requestId) ? await db.joinRequests.get(requestId) : null;
  if (!request) throw notFound('Request not found.');
  await adminGroup(ctx, request.groupId);
  await db.joinRequests.remove(requestId);
}

/** The requester withdraws their own pending request. */
export async function cancelJoinRequest(ctx, groupId) {
  const actor = await requireActor(ctx);
  need(isStr(groupId), 'Invalid input.');
  await db.joinRequests.removeWhere({ groupId, accountId: actor.id });
}

// ---------------------------------------------------------------- membership

const dropFromTeam = (userId) => ({ pullValue: { memberIds: userId, adminIds: userId }, unset: [`memberRoles.${userId}`] });

/** Admins remove members; only the owner removes another admin; nobody removes the owner. */
export async function kickMember(ctx, groupId, userId) {
  const { actor, group } = await adminGroup(ctx, groupId);
  need(isStr(userId), 'Invalid input.');
  if (userId === group.ownerId) throw forbidden('The owner cannot be removed.');
  if (userId === actor.id) throw badRequest('Use "Leave team" to remove yourself.');
  if (isGroupAdmin(group, userId) && group.ownerId !== actor.id) throw forbidden('Only the owner can remove another admin.');
  if (!isGroupMember(group, userId)) return;
  await releaseMemberTasks(groupId, userId, actor);
  await db.roleChanges.removeWhere({ groupId, accountId: userId });
  await db.groups.update(groupId, {}, dropFromTeam(userId));
  await logActivity(actor, 'removed a member from', group.name, { groupId });
}

export async function promoteMember(ctx, groupId, userId) {
  const { group } = await adminGroup(ctx, groupId);
  need(isStr(userId), 'Invalid input.');
  if (!isGroupMember(group, userId)) return;
  await db.groups.update(groupId, {}, { addToSet: { adminIds: userId } });
}

export async function demoteMember(ctx, groupId, userId) {
  const { group } = await ownerGroup(ctx, groupId);
  need(isStr(userId), 'Invalid input.');
  if (userId === group.ownerId) throw forbidden('The owner always stays an admin.');
  await db.groups.update(groupId, {}, { pullValue: { adminIds: userId } });
}

/** A member (not the owner) leaves; their unfinished tasks there become Unassigned. */
export async function leaveGroup(ctx, groupId) {
  const actor = await requireActor(ctx);
  const group = await mustGroup(groupId);
  if (group.ownerId === actor.id) throw badRequest('The owner cannot leave — transfer ownership or delete the team.');
  if (!isGroupMember(group, actor.id)) return;
  await releaseMemberTasks(groupId, actor.id, actor);
  await db.roleChanges.removeWhere({ groupId, accountId: actor.id });
  await db.groups.update(groupId, {}, dropFromTeam(actor.id));
  await logActivity(actor, 'left team', group.name, { groupId });
}

/**
 * Internal (account deletion): take a person out of every team. A team they owned passes to another
 * admin (or the next member); a team with nobody left is removed with its work.
 */
export async function removeUserFromTeams(userId) {
  await db.joinRequests.removeWhere({ accountId: userId });
  await db.roleChanges.removeWhere({ accountId: userId });
  for (const g of await db.groups.find({ memberIds: userId })) {
    const memberIds = g.memberIds.filter((id) => id !== userId);
    if (memberIds.length === 0) { await purgeGroup(g.id); continue; }
    if (g.ownerId === userId) {
      const adminIds = (g.adminIds || []).filter((id) => id !== userId);
      const ownerId = adminIds.find((id) => memberIds.includes(id)) || memberIds[0];
      // Two updates: MongoDB rejects pulling and adding to the SAME field in one operation.
      await db.groups.update(g.id, { ownerId }, dropFromTeam(userId));
      await db.groups.update(g.id, {}, { addToSet: { adminIds: ownerId } });
    } else {
      await db.groups.update(g.id, {}, dropFromTeam(userId));
    }
  }
}

// ---------------------------------------------------------------- team roles

/** Admin: add a role to the team's list. Names are unique per team, ignoring case. */
export async function addRole(ctx, groupId, name) {
  const { actor, group } = await adminGroup(ctx, groupId);
  const clean = roleNameOf(name);
  need(clean, 'Give the role a name.', 'name');
  const roles = group.roles || [];
  need(roles.length < MAX_ROLES, `A team can have at most ${MAX_ROLES} roles.`, 'name');
  need(!roles.some((r) => r.name.toLowerCase() === clean.toLowerCase()), 'This team already has a role with that name.', 'name');
  const role = { id: newId(), name: clean };
  await db.groups.update(group.id, {}, { push: { roles: role } });
  await logActivity(actor, `added the role "${clean}" to`, group.name, { groupId });
  return role;
}

/** Admin: delete a role. Refused while anyone holds it, so no member is silently left without one. */
export async function removeRole(ctx, groupId, roleId) {
  const { actor, group } = await adminGroup(ctx, groupId);
  const role = findRole(group, roleId);
  if (!role) throw notFound('Role not found.');
  const holders = Object.values(group.memberRoles || {}).filter((id) => id === roleId).length;
  if (holders > 0) throw badRequest(`${holders} member${holders === 1 ? ' still has' : 's still have'} the "${role.name}" role. Ask them to switch first.`);
  await db.groups.update(group.id, {}, { pull: { roles: { id: roleId } } });
  await db.roleChanges.removeWhere({ groupId: group.id, roleId });
  await logActivity(actor, `removed the role "${role.name}" from`, group.name, { groupId });
}

/**
 * Admin: ask a member to take another role. Nothing changes until THEY accept (`answerRoleChange`): a member cannot
 * change their own role, only an admin can propose it. An admin's own role is theirs to set, so for themselves this just
 * applies. One open proposal per person: a new one replaces it.
 */
export async function proposeRoleChange(ctx, groupId, userId, roleId) {
  const { actor, group } = await adminGroup(ctx, groupId);
  need(isStr(userId), 'Invalid input.');
  if (!isGroupMember(group, userId)) throw badRequest('That person is not in this team.');
  const role = findRole(group, roleId);
  need(role, 'Pick one of the team\'s roles.', 'roleId');
  if (userId === actor.id) {
    await db.roleChanges.removeWhere({ groupId, accountId: actor.id }); // what they set now overrides any old proposal
    await db.groups.update(groupId, { [`memberRoles.${actor.id}`]: roleId });
    return null;
  }
  if ((group.memberRoles || {})[userId] === roleId) throw badRequest('They already have that role.');
  await db.roleChanges.removeWhere({ groupId, accountId: userId });
  const proposal = await db.roleChanges.insert({ groupId, accountId: userId, roleId, requestedById: actor.id, createdAt: nowISO() });
  await notify(userId, { type: 'assignment', message: `${actor.name} asked you to take the "${role.name}" role in ${group.name}. Open the team to accept or decline.`, link: `/team?team=${group.id}` });
  return proposal;
}

/** The member answers a proposal addressed to them. Anyone else gets "not found", so ids reveal nothing. */
export async function answerRoleChange(ctx, changeId, accept) {
  const actor = await requireActor(ctx);
  const change = isStr(changeId) ? await db.roleChanges.get(changeId) : null;
  if (!change || change.accountId !== actor.id) throw notFound('Request not found.');
  const group = await db.groups.get(change.groupId);
  const role = group && findRole(group, change.roleId);
  await db.roleChanges.remove(changeId);
  if (!group || !isGroupMember(group, actor.id) || !role) throw notFound('That role change is no longer available.');
  if (accept === true) await db.groups.update(group.id, { [`memberRoles.${actor.id}`]: role.id });
  await notify(change.requestedById, {
    type: 'assignment',
    message: `${actor.name} ${accept === true ? 'accepted' : 'declined'} the "${role.name}" role in ${group.name}.`,
    link: `/team?team=${group.id}`,
  });
}

/** Admin: withdraw a proposal they made. */
export async function cancelRoleChange(ctx, changeId) {
  await requireActor(ctx); // authenticate before looking anything up, so a stranger learns nothing about which ids exist
  const change = isStr(changeId) ? await db.roleChanges.get(changeId) : null;
  if (!change) throw notFound('Request not found.');
  await adminGroup(ctx, change.groupId);
  await db.roleChanges.remove(changeId);
}

// ---------------------------------------------------------------- announcements

export async function postTeamAnnouncement(ctx, groupId, body) {
  const { actor } = await adminGroup(ctx, groupId);
  need(text(body), 'Write the announcement first.', 'text');
  return db.teamAnnouncements.insert({ groupId, authorId: actor.id, text: text(body).slice(0, 5000), createdAt: nowISO() });
}

export async function deleteTeamAnnouncement(ctx, id) {
  await requireActor(ctx); // authenticate before looking anything up, so a stranger learns nothing about which ids exist
  const announcement = isStr(id) ? await db.teamAnnouncements.get(id) : null;
  if (!announcement) throw notFound('Announcement not found.');
  await adminGroup(ctx, announcement.groupId);
  await db.teamAnnouncements.remove(id);
}

// ---------------------------------------------------------------- chat

async function memberGroup(ctx, groupId) {
  const actor = await requireActor(ctx);
  const group = await mustGroup(groupId);
  if (!isGroupMember(group, actor.id)) throw forbidden('Only team members can use the team chat.');
  return { actor, group };
}

/** A team's chat, oldest-first within the page. Load earlier history with `before` = the id of the oldest message you have. */
export async function listMessages(ctx, groupId, options = {}) {
  await memberGroup(ctx, groupId);
  const { limit, before } = cleanPage(options, 200, config.PAGE_SIZE);
  return (await db.messages.page({ groupId }, { limit, before })).reverse();
}

/** `image` is an already-uploaded file record (`{ fileId, ... }`); `mentionIds` get a notification. */
export async function sendMessage(ctx, groupId, { text: body = '', image = null, replyTo = null, mentionIds = [] } = {}) {
  const { actor, group } = await memberGroup(ctx, groupId);
  const clean = text(body).slice(0, 5000);
  need(clean || image, 'Write a message or attach a photo.');
  let picture = null;
  if (image) {
    const file = isStr(image.fileId) ? await db.files.get(image.fileId) : null;
    // Only a photo the sender uploaded can be posted.
    if (!file || file.ownerId !== actor.id) throw badRequest('That photo was not found.');
    picture = { fileId: file.id, url: file.url, name: file.name, mime: file.mime };
  }
  if (replyTo && !(isStr(replyTo) && await db.messages.findOne({ id: replyTo, groupId }))) throw badRequest('The message you replied to is gone.');
  const message = await db.messages.insert({ groupId, authorId: actor.id, text: clean, image: picture, replyTo: replyTo || null, reactions: {}, deleted: false, createdAt: nowISO() });
  for (const id of [...new Set(Array.isArray(mentionIds) ? mentionIds : [])]) {
    if (isStr(id) && id !== actor.id && isGroupMember(group, id)) {
      await notify(id, { type: 'mention', message: `${actor.name} mentioned you in ${group.name}.`, link: `/team?team=${group.id}` });
    }
  }
  return message;
}

/** One emoji reaction per person per message; sending the same emoji again removes it. */
export async function reactToMessage(ctx, messageId, emoji) {
  await requireActor(ctx); // authenticate before looking anything up, so a stranger learns nothing about which ids exist
  const message = isStr(messageId) ? await db.messages.get(messageId) : null;
  if (!message) throw notFound('Message not found.');
  const { actor } = await memberGroup(ctx, message.groupId);
  need(isStr(emoji) && emoji.length > 0 && emoji.length <= 16, 'Invalid reaction.');
  if (message.deleted) return message;
  // Atomic: only THIS person's key changes, so simultaneous reactions from different people all survive.
  const path = `reactions.${actor.id}`;
  return message.reactions?.[actor.id] === emoji
    ? db.messages.update(messageId, {}, { unset: [path] })
    : db.messages.update(messageId, { [path]: emoji });
}

/** Author or a team admin. The message stays as a "Message deleted" placeholder, like Messenger. */
export async function deleteMessage(ctx, messageId) {
  await requireActor(ctx); // authenticate before looking anything up, so a stranger learns nothing about which ids exist
  const message = isStr(messageId) ? await db.messages.get(messageId) : null;
  if (!message) throw notFound('Message not found.');
  const { actor, group } = await memberGroup(ctx, message.groupId);
  if (message.deleted) return;
  if (message.authorId !== actor.id && !isGroupAdmin(group, actor.id)) throw forbidden('You can only delete your own messages.');
  await releaseFile(message.image?.fileId);
  await db.messages.update(messageId, { deleted: true, deletedBy: actor.id, text: '', image: null, reactions: {} });
}
